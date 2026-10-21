// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { RoomModelTeams } from './support/model-teams-probe.js';
import { describeTeamBadge } from '../src/runs/model-teams/team-badge.js';
import {
  describeFailures,
  describeScoreboard,
  formatUsd,
} from '../src/runs/model-teams/team-sheet-text.js';
import { findRoomModelTeams } from './support/loaded-team.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import {
  buildNoKeyTeam,
  buildRecommendation,
  buildRunModelTeams,
  buildScoreboard,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const FORBIDDEN = /vai subir|garantid|recomendamos|compre |confiante/i;

const PENDING = buildRecommendation('lucas', {
  status: 'pending',
  action: null,
  actionLabel: null,
  levels: null,
  roles: null,
  confidence: null,
});

function mixedState(): ReturnType<typeof buildRunModelTeams> {
  return buildRunModelTeams({
    teams: [
      buildTeamState('nina'),
      buildTeamState('lucas', { recent: [PENDING] }),
      buildTeamState('olivia', {
        team: buildTeamView('olivia', { isEnabled: false }),
        recent: [],
      }),
    ],
  });
}

async function openBalcony(
  state: ReturnType<typeof buildRunModelTeams> | 'absent',
): Promise<HTMLElement> {
  const harness = createModelTeamsHarness(state);
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [...modelTeamsRoutes(harness, LIVE_RUN_ID), ...roomRoutes(createRoomHarness())],
    probe: (
      <LiveMarketProvider>
        <RoomModelTeams runId={LIVE_RUN_ID} />
      </LiveMarketProvider>
    ),
  });
  return findRoomModelTeams();
}

describe('as equipes ◆ na varanda (RF19)', () => {
  test('cada equipe tem inicial, nome e o estado em ícone + palavra: comprar, pensando; a desligada não aparece', async () => {
    const team = await openBalcony(mixedState());
    const nina = await within(team).findByRole('button', {
      name: /^Nina, equipe de modelo Gemini, comprar/,
    });
    expect(nina.getAttribute('data-team')).toBe('nina');
    expect(nina.textContent).toContain('N');
    const lucas = within(team).getByRole('button', {
      name: /^Lucas, equipe de modelo Claude, pensando/,
    });
    expect(lucas.getAttribute('data-team')).toBe('lucas');
    expect(within(team).queryByRole('button', { name: /^Olívia, / })).toBeNull();
    expect(team.textContent).not.toContain('desligada');
    expect(team.textContent).toContain('EQUIPES DE MODELO');
    expect(team.textContent).not.toContain('em breve');
  });

  test('os estados do provedor aparecem em palavra: sem chave, teto de custo e provedor fora com a hora', async () => {
    const noKey = buildTeamState('nina', { team: buildNoKeyTeam('nina'), recent: [] });
    const budget = buildTeamState('lucas', {
      team: buildTeamView('lucas', {
        providerStatus: {
          state: 'budget_exhausted',
          keyConfigured: true,
          modelConfigured: true,
          circuitUntil: null,
          message: '⏸ parada pelo teto de custo',
          isAvailable: false,
        },
      }),
    });
    const circuit = buildTeamState('olivia', {
      team: buildTeamView('olivia', {
        providerStatus: {
          state: 'circuit_open',
          keyConfigured: true,
          modelConfigured: true,
          circuitUntil: '2026-10-17T13:30:00.000Z',
          message: '⚡ provedor fora',
          isAvailable: false,
        },
      }),
    });
    const team = await openBalcony(buildRunModelTeams({ teams: [noKey, budget, circuit] }));
    await within(team).findByRole('button', { name: /^Nina, .*sem chave configurada/ });
    expect(
      within(team).getByRole('button', { name: /^Lucas, .*parada pelo teto de custo/ }),
    ).toBeDefined();
    expect(
      within(team).getByRole('button', {
        name: /^Olívia, .*provedor fora \(tentando de novo às \d\d:\d\d\)/,
      }),
    ).toBeDefined();
  });

  test('a ficha mostra modelo, nuvem, preços, os três papéis, acertos com "poucas previsões", custo e falhas', async () => {
    const team = await openBalcony(mixedState());
    fireEvent.click(await within(team).findByRole('button', { name: /^Nina, / }));
    const sheet = screen.getByRole('group', { name: 'Ficha de Nina' });
    const text = sheet.textContent ?? '';
    expect(text).toContain('MODELO · Nina (Gemini)');
    expect(text).toContain('Gemini Pro');
    expect(text).toContain('nuvem do Google');
    expect(text).toContain('entrada 100,00 · alvo 103,50 · proteção 98,40');
    expect(text).toContain('Analista de tendência: tendência de alta');
    expect(text).toContain('Analista de risco: risco médio');
    expect(text).toContain('Gestor: comprar');
    expect(text).toContain('Fechamentos subindo nas últimas velas.');
    expect(text).toContain('3 de 5 acertos (60%)');
    expect(text).toContain('poucas previsões (menos de 30)');
    expect(text).toContain('hoje US$ 0,0327 · mês US$ 0,9810');
    expect(text).toContain('Falhas em 24 h: 3 de 24 chamadas (13%)');
    expect(text).toContain('gerado por modelo: Gemini Pro · pode errar');
    expect(text).toContain(
      'Pode errar; o auditor mede o acerto. Não é recomendação. Tudo simulado.',
    );
    expect(
      within(sheet)
        .getByRole('link', { name: 'Ligar/desligar nas preferências' })
        .getAttribute('href'),
    ).toBe('/conta#equipes');
    expect(FORBIDDEN.test(text)).toBe(false);
  });

  test('a ficha da Olívia diz "nuvem da OpenAI" e o motivo ocultado pela higiene aparece como frase fixa', async () => {
    const hidden = buildRecommendation('olivia', { isReasonHidden: true });
    const state = buildRunModelTeams({
      teams: [
        buildTeamState('nina'),
        buildTeamState('lucas'),
        buildTeamState('olivia', { recent: [hidden] }),
      ],
    });
    const team = await openBalcony(state);
    fireEvent.click(await within(team).findByRole('button', { name: /^Olívia, / }));
    const sheet = screen.getByRole('group', { name: 'Ficha de Olívia' });
    expect(sheet.textContent).toContain('nuvem da OpenAI');
    expect(sheet.textContent).toContain(
      'O modelo deu um motivo fora das regras de linguagem da casa; o texto foi ocultado.',
    );
    expect(sheet.textContent).not.toContain('Fechamentos subindo');
  });

  test('execução que não é ao vivo (409): a varanda explica que as equipes só existem ao vivo', async () => {
    const team = await openBalcony('absent');
    await waitFor(() => expect(team.textContent).toContain('só aparecem nas simulações ao vivo'));
  });
});

describe('texto da ficha (puro)', () => {
  test('o selo segue a ordem: desligada, provedor, pensando, ação, aguardando', () => {
    const base = { latest: undefined, timeZone: 'UTC' } as const;
    const off = describeTeamBadge({ ...base, team: buildTeamView('nina', { isEnabled: false }) });
    expect(off.word).toBe('desligada');
    const none = describeTeamBadge({ ...base, team: buildNoKeyTeam('nina') });
    expect(none).toMatchObject({ icon: 'alert', word: 'sem chave configurada' });
    const ready = buildTeamView('nina');
    expect(describeTeamBadge({ ...base, team: ready }).word).toBe('aguardando a vela');
    expect(describeTeamBadge({ team: ready, latest: PENDING, timeZone: 'UTC' }).word).toBe(
      'pensando',
    );
    const sell = buildRecommendation('nina', { action: 'sell', actionLabel: 'vender' });
    expect(describeTeamBadge({ team: ready, latest: sell, timeZone: 'UTC' })).toMatchObject({
      icon: 'arrowDown',
      word: 'vender',
      tone: 'sell',
    });
    const hold = buildRecommendation('nina', { action: 'hold', actionLabel: 'esperar' });
    expect(describeTeamBadge({ team: ready, latest: hold, timeZone: 'UTC' }).word).toBe('esperar');
  });

  test('custo arredonda PARA CIMA em 4 casas, em BigInt, sem passar por número', () => {
    expect(formatUsd('0.01090000')).toBe('US$ 0,0109');
    expect(formatUsd('0.01090001')).toBe('US$ 0,0110');
    expect(formatUsd('0')).toBe('US$ 0,0000');
    expect(formatUsd('12345678901234.12345678')).toBe('US$ 12.345.678.901.234,1235');
    expect(formatUsd('lixo')).toBe('—');
  });

  test('o placar: Wilson arredonda para fora, 30 contadas deixam de ser "poucas previsões"', () => {
    const few = describeScoreboard(buildScoreboard());
    expect(few.headline).toBe('3 de 5 acertos (60%)');
    expect(few.verdict).toContain('poucas previsões (menos de 30)');
    expect(few.range).toBe('faixa de Wilson: entre 23% e 89%');
    const enough = describeScoreboard(
      buildScoreboard({
        hits: 20,
        counted: 30,
        verdict: 'above',
        hitRate: '0.66666667',
        lower: '0.48800000',
        upper: '0.80000000',
      }),
    );
    expect(enough.verdict).toBe('acima da moeda ao ar (50%)');
    expect(enough.headline).toBe('20 de 30 acertos (67%)');
    expect(
      describeScoreboard(
        buildScoreboard({ hits: 0, counted: 0, hitRate: null, lower: null, upper: null }),
      ).headline,
    ).toBe('Sem previsões contadas ainda');
  });

  test('a taxa de falha sem chamadas não divide por zero', () => {
    expect(describeFailures({ hours: 24, total: 0, failed: 0 })).toBe(
      'Falhas em 24 h: nenhuma chamada ainda',
    );
  });
});
