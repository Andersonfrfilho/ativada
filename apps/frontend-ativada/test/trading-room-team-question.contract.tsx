// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TradingRoom } from '../src/runs/trading-room/TradingRoom.component.js';
import { HeardQuestion } from '../src/runs/trading-room/voice/HeardQuestion.component.js';
import type { RoomQuestions } from '../src/runs/trading-room/useRoomQuestions.hook.js';
import type { TeamQuestionsModel } from '../src/runs/trading-room/team-question/useTeamQuestions.hook.js';
import {
  dataResponse,
  errorResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { LIVE_BASE, LIVE_RUN_ID, liveRoutes } from './support/live-tracking-harness.js';
import {
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness } from './support/team-room-fixtures.js';
import { buildTradePlan } from './support/trade-plan-fixtures.js';

// A pergunta livre a uma equipe ◆ (adendo da spec 015): o campo por equipe LIGADA, o aviso fixo, o alerta de dado pessoal, a
// espera, a resposta no histórico e na região viva, as falhas em palavras e a fala que vira pergunta livre.

const QUESTION = 'Como você vê o BTC nas próximas horas?';
const ANSWER = 'O BTC fechou as últimas velas perto da média. Não é recomendação.';
const NOTICE =
  'Seu texto vai para a OpenAI (provedor da Olívia). Não escreva nome, e-mail, saldo ou dados pessoais. Gasta do teto diário. Não é recomendação.';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

type Item = Record<string, unknown>;
type Server = { items: Item[]; posted: RecordedCall[]; postResponse?: Response };

function onlyOlivia(): ReturnType<typeof buildRunModelTeams> {
  return buildRunModelTeams({
    teams: [
      buildTeamState('nina', { team: buildTeamView('nina', { isEnabled: false }), recent: [] }),
      buildTeamState('lucas', { team: buildTeamView('lucas', { isEnabled: false }), recent: [] }),
      buildTeamState('olivia'),
    ],
  });
}

function questionItem(overrides: Item = {}): Item {
  return {
    id: '01a1591b-f07d-7000-ac01-d050e8960001',
    teamKey: 'olivia',
    symbol: 'BTCUSDT',
    question: QUESTION,
    status: 'pending',
    answer: null,
    failureCode: null,
    costUsd: '0',
    requestedAt: 1_767_225_600_000,
    decidedAt: null,
    ...overrides,
  };
}

function questionRoutes(server: Server): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: `${LIVE_BASE}/model-teams/questions`,
      respond: (): Response => dataResponse({ notice: 'Não é recomendação.', items: server.items }),
    },
    {
      method: 'POST',
      path: `${LIVE_BASE}/model-teams/olivia/questions`,
      respond: (call): Response => {
        server.posted.push(call);
        if (server.postResponse !== undefined) return server.postResponse;
        server.items = [questionItem()];
        return dataResponse({ questionId: '01a1591b-f07d-7000-ac01-d050e8960001' }, 202);
      },
    },
  ];
}

function openRoom(server: Server): void {
  renderApp({
    path: `/backtests/${LIVE_RUN_ID}`,
    isAuthenticated: true,
    routes: [
      ...liveRoutes(createRoomHarness()),
      {
        method: 'GET',
        path: `${LIVE_BASE}/trade-plan`,
        respond: (): Response => dataResponse(buildTradePlan()),
      },
      ...modelTeamsRoutes(createModelTeamsHarness(onlyOlivia()), LIVE_RUN_ID),
      ...questionRoutes(server),
    ],
    probe: (
      <MemoryRouter>
        <LiveMarketProvider>
          <TradingRoom runId={LIVE_RUN_ID} screen={null} />
        </LiveMarketProvider>
      </MemoryRouter>
    ),
  });
}

async function oliviaField(): Promise<HTMLTextAreaElement> {
  const field = await screen.findByLabelText('Pergunte à Olívia ◆');
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('o campo não é uma área de texto');
  return field;
}

describe('o campo "Pergunte à Olívia ◆"', () => {
  test('aparece só para a equipe ligada, com o aviso fixo e o contador de 280', async () => {
    openRoom({ items: [], posted: [] });
    const field = await oliviaField();
    const box = screen.getByRole('region', { name: 'Pergunte à equipe' });
    expect(within(box).getByText(NOTICE)).toBeDefined();
    expect(within(box).queryByLabelText('Pergunte à Nina ◆')).toBeNull();
    expect(within(box).queryByLabelText('Pergunte à Lucas ◆')).toBeNull();
    fireEvent.change(field, { target: { value: QUESTION } });
    expect(within(box).getByText(`${QUESTION.length} de 280 caracteres`)).toBeDefined();
    expect(field.maxLength).toBe(280);
  });

  test('dado pessoal avisa e trava o envio; nada sai para a API', async () => {
    const server: Server = { items: [], posted: [] };
    openRoom(server);
    const field = await oliviaField();
    fireEvent.change(field, { target: { value: 'meu email é ana@exemplo.com, e o BTC?' } });
    expect(screen.getByText(/Parece haver dado pessoal/u)).toBeDefined();
    const button = screen.getByRole('button', { name: 'Perguntar à Olívia' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.change(field, { target: { value: 'liga 11 98765-4321' } });
    expect(button).toHaveProperty('disabled', true);
    expect(server.posted).toHaveLength(0);
  });

  test('envia a moeda e o texto; mostra "pensando" e a resposta entra em "Perguntas" e na região viva', async () => {
    const server: Server = { items: [], posted: [] };
    openRoom(server);
    const field = await oliviaField();
    fireEvent.change(field, { target: { value: `  ${QUESTION} ` } });
    fireEvent.click(screen.getByRole('button', { name: 'Perguntar à Olívia' }));
    await waitFor(() => expect(server.posted).toHaveLength(1));
    expect(server.posted[0]?.body).toStrictEqual({ symbol: 'BTCUSDT', question: QUESTION });
    await screen.findByText('Olívia está pensando…');
    expect(field.value).toBe('');
    server.items = [
      questionItem({ status: 'answered', answer: ANSWER, decidedAt: Date.now() + 1_000 }),
    ];
    const history = screen.getByRole('region', { name: 'Perguntas' });
    await waitFor(() => expect(history.textContent).toContain(ANSWER));
    expect(history.textContent).toContain(`Olívia · BTC/USDT · ${QUESTION}`);
    const room = screen.getByRole('region', { name: 'Sala de operações' });
    const live = room.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    await waitFor(() => expect(live[0]?.textContent).toBe(`Olívia respondeu: ${ANSWER}`));
  });

  test('a falha do worker e a recusa da API aparecem em palavras, nunca o código cru', async () => {
    const server: Server = { items: [], posted: [] };
    openRoom(server);
    const field = await oliviaField();
    fireEvent.change(field, { target: { value: QUESTION } });
    fireEvent.click(screen.getByRole('button', { name: 'Perguntar à Olívia' }));
    await screen.findByText('Olívia está pensando…');
    server.items = [questionItem({ status: 'failed', failureCode: 'BUDGET_EXHAUSTED' })];
    await screen.findByText(
      'O teto de custo do dia (ou do mês) acabou: a pergunta não foi enviada.',
    );
    expect(screen.queryByText(/BUDGET_EXHAUSTED/u)).toBeNull();
    server.postResponse = errorResponse(429, 'MODEL_QUESTION_LIMIT_REACHED');
    fireEvent.change(field, { target: { value: QUESTION } });
    fireEvent.click(screen.getByRole('button', { name: 'Perguntar à Olívia' }));
    await screen.findByText(/Você usou as perguntas livres de hoje/u);
  });
});

describe('a fala que não casa com uma pergunta rápida', () => {
  test('com uma equipe ligada, oferece "Perguntar à Olívia" e só preenche o campo', () => {
    const drafts: { teamKey: string; text: string }[] = [];
    let done = 0;
    const team: TeamQuestionsModel = {
      teams: [{ key: 'olivia', name: 'Olívia', company: 'a OpenAI' }],
      draftOf: () => '',
      setDraft: (teamKey, text) => drafts.push({ teamKey, text }),
      ask: () => undefined,
      isSending: () => false,
      errorOf: () => undefined,
      stateOf: () => undefined,
      entries: [],
    };
    const questions: RoomQuestions = {
      symbols: ['BTCUSDT'],
      symbol: 'BTCUSDT',
      setSymbol: () => undefined,
      ask: () => undefined,
      isAsking: false,
      hasFailed: false,
      history: [],
      latest: undefined,
      team,
    };
    const spoken = 'o que você acha do halving';
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [],
      probe: <HeardQuestion text={spoken} questions={questions} onDone={() => (done += 1)} />,
    });
    expect(screen.getByText('Não entendi qual pergunta. Escolha uma abaixo.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Perguntar à Olívia: “${spoken}”` }));
    expect(drafts).toStrictEqual([{ teamKey: 'olivia', text: spoken }]);
    expect(done).toBe(1);
  });
});
