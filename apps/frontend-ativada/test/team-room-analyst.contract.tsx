// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen, waitFor, within } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { decisionSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { CompactTeam } from '../src/runs/team-room/CompactTeam.component.js';
import { describeAnnouncement } from '../src/runs/team-room/team-room-lines.js';
import { buildTeamRoomView } from '../src/runs/team-room/team-room-view.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import { TeamRoomSection } from '../src/runs/team-room/TeamRoomSection.component.js';
import { useTeamRoomPreference } from '../src/runs/team-room/useTeamRoomPreference.hook.js';
import {
  analystRoutes,
  buildAnalystResponse,
  buildDecided,
  buildUnavailable,
  createAnalystHarness,
  MOVE_COST_REASON,
  PAUSE_LINE,
  type AnalystHarness,
} from './support/analyst-fixtures.js';
import { buildProjectionsSummary } from './support/candle-chart-fixtures.js';
import { FIXTURE_CANDLE_TIME } from './support/live-status-fixtures.js';
import { LIVE_RUN_ID, type LiveHarness } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { buildRoomDecision, createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function noop(): void {
  return;
}

function Room(): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  useLiveStream(noop, noop);
  return (
    <TeamRoomSection
      runId={LIVE_RUN_ID}
      preference={preference}
      onPreferenceChange={update}
      monitor={undefined}
    />
  );
}

function openWith(
  live: LiveHarness,
  analyst: AnalystHarness,
  probe: ReactElement,
): ReturnType<typeof renderApp> {
  // O escritório abre recolhido por padrão; estes testes olham o palco aberto.
  localStorage.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify({ isCollapsed: false }));
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [...roomRoutes(live, buildProjectionsSummary()), ...analystRoutes(analyst)],
    probe,
  });
}

// A vela de 15 min do analista tem de coincidir com a decisão da estratégia mais recente.
function analystAtLatest(overrides: Record<string, unknown> = {}): AnalystHarness {
  const decided = buildDecided({ candleTime: FIXTURE_CANDLE_TIME, ...overrides });
  return createAnalystHarness({
    analyst: buildAnalystResponse({ current: decided }),
    decisionPages: [{ items: [decided], nextCursor: null }],
  });
}

async function stageOf(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-motion]')).not.toBeNull());
  return document.querySelector<HTMLElement>('[data-motion]') ?? document.body;
}

describe('sala da equipe com o analista de risco real', () => {
  test('a fala do analista de risco toma o lugar do resumo do placar, com frases do servidor', async () => {
    openWith(createRoomHarness(), analystAtLatest(), <Room />);
    const stage = within(await stageOf());
    await stage.findByText(PAUSE_LINE);
    expect(stage.getByText('PAUSA')).toBeDefined();
    expect(stage.getByText(MOVE_COST_REASON)).toBeDefined();
    expect(stage.getByText('modo sombra: o analista só observa')).toBeDefined();
    expect(stage.queryByText('Resumo do placar da estratégia')).toBeNull();
    expect(stage.getAllByText('Analista de risco')).toHaveLength(1);
  });

  test('a lista em texto fala do analista', async () => {
    openWith(createRoomHarness(), analystAtLatest(), <Room />);
    await stageOf();
    const details = (await screen.findByText('Falas desta vela em texto')).closest('details');
    const list = within(details ?? document.body).getAllByRole('listitem');
    expect(list).toHaveLength(6);
    const texts = list.map((item) => item.textContent ?? '');
    expect(texts.some((text) => text.includes(`Analista de risco — PAUSA. ${PAUSE_LINE}`))).toBe(
      true,
    );
  });

  test('sem analista na simulação a sala segue com o resumo do placar', async () => {
    openWith(createRoomHarness(), createAnalystHarness({ analyst: 'disabled' }), <Room />);
    const stage = within(await stageOf());
    await stage.findByText('Resumo do placar da estratégia');
    expect(stage.queryByText('modo sombra: o analista só observa')).toBeNull();
  });

  test('analista indisponível agora mostra a frase do servidor no lugar da postura', async () => {
    const message = 'A simulação parou de avançar; o analista volta quando ela voltar.';
    const analyst = createAnalystHarness({
      analyst: buildAnalystResponse({ current: buildUnavailable('stalled', message), locks: [] }),
    });
    openWith(createRoomHarness(), analyst, <Room />);
    const stage = within(await stageOf());
    await stage.findByText(message);
    expect(stage.getByText('sem fala')).toBeDefined();
  });

  test('vela da estratégia sem decisão do analista diz que não há fala gravada', async () => {
    const analyst = analystAtLatest({ candleTime: FIXTURE_CANDLE_TIME - 900_000 });
    openWith(createRoomHarness(), analyst, <Room />);
    const stage = within(await stageOf());
    await stage.findByText('O analista não tem fala gravada para esta vela.');
  });
});

describe('equipe junto do gráfico', () => {
  test('a coluna "Equipe agora" mostra o analista de risco no lugar do resumo', async () => {
    openWith(
      createRoomHarness(),
      analystAtLatest(),
      <CompactTeam runId={LIVE_RUN_ID} isAnimationOn={false} />,
    );
    const aside = within(await screen.findByRole('complementary'));
    await aside.findByText(PAUSE_LINE);
    expect(aside.getByText('PAUSA')).toBeDefined();
    expect(aside.queryByText('Resumo do placar da estratégia')).toBeNull();
  });

  test('sem analista a coluna mantém o resumo do placar', async () => {
    openWith(
      createRoomHarness(),
      createAnalystHarness({ analyst: 'disabled' }),
      <CompactTeam runId={LIVE_RUN_ID} isAnimationOn={false} />,
    );
    const aside = within(await screen.findByRole('complementary'));
    await aside.findByText('Resumo do placar da estratégia');
  });
});

describe('o modelo da sala', () => {
  test('o anúncio do leitor de tela cita o analista, e só o resumo quando não há analista', () => {
    const decision = decisionSchema.parse(buildRoomDecision());
    const plain = buildTeamRoomView({ decision, triggers: undefined });
    expect(describeAnnouncement(plain, '10:00 de hoje')).toContain('Resumo do placar: Esperou.');
    const withAnalyst = buildTeamRoomView({
      decision,
      triggers: undefined,
      riskAnalyst: {
        name: 'Analista de risco',
        look: { tone: 'warn', icon: 'pause', word: 'PAUSA' },
        lines: [PAUSE_LINE],
        isShadow: true,
      },
    });
    const announcement = describeAnnouncement(withAnalyst, '10:00 de hoje');
    expect(announcement).toContain('Analista de risco: PAUSA.');
    expect(announcement).not.toContain('Resumo do placar');
  });
});
