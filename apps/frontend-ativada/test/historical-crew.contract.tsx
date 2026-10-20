// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen, waitFor, within } from '@testing-library/react';

import { RunTeamAside } from '../src/runs/team-room/RunTeamAside.component.js';
import { TeamAside } from '../src/runs/team-room/TeamAside.context.js';
import {
  buildProjectionsResponse,
  buildProjectionsSummary,
} from './support/candle-chart-fixtures.js';
import { dataResponse, pageResponse } from './support/fake-fetch.js';
import { LIVE_BASE, LIVE_RUN_ID } from './support/live-tracking-harness.js';
import {
  buildNoKeyTeam,
  buildRecommendation,
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import type { TeamView } from '../src/runs/model-teams/model-teams.validation.js';
import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { RoomModelTeams } from '../src/runs/trading-room/RoomModelTeams.component.js';
import { findRoomModelTeams } from './support/loaded-team.js';
import { renderApp } from './support/render-app.js';
import { buildRoomDecision, createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const FIRST_CANDLE = 1_767_225_600_000;
const CREW = ['Tiago', 'Renata', 'Alice', 'Vitor', 'Sofia', 'Otávio'] as const;

// Olívia ligada, Nina desligada, Lucas ligada sem chave.
const MIXED_TEAMS: readonly TeamView[] = [
  buildTeamView('nina', { isEnabled: false }),
  buildNoKeyTeam('lucas'),
  buildTeamView('olivia'),
];

// A rota das equipes da execução recusa (backtest não é ao vivo): valem as preferências de hoje.
function openBacktest(mine: readonly TeamView[] = MIXED_TEAMS): void {
  const harness = createModelTeamsHarness('absent');
  harness.myTeams = mine;
  const decision = { ...buildRoomDecision({}), candleTime: FIRST_CANDLE };
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [
      {
        method: 'GET',
        path: `${LIVE_BASE}/decisions`,
        respond: (): Response => pageResponse([decision], null),
      },
      {
        method: 'GET',
        path: `${LIVE_BASE}/projections`,
        respond: (): Response =>
          dataResponse(buildProjectionsResponse({ summary: buildProjectionsSummary() })),
      },
      ...modelTeamsRoutes(harness, LIVE_RUN_ID),
    ],
    probe: (
      <RunTeamAside runId={LIVE_RUN_ID} kind="backtest" timeframe="1h">
        <TeamAside pointedOpenTime={undefined} />
      </RunTeamAside>
    ),
  });
}

function team(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Equipe agora' });
}

describe('a equipe de um backtest concluído: nomes e equipes ◆', () => {
  test('cada um dos seis agentes tem o nome em texto visível', async () => {
    openBacktest();
    await waitFor(() => expect(team().textContent).toContain('Última vela da execução'));
    for (const name of CREW) {
      expect(within(team()).getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  test('as equipes ◆ aparecem como personagens com nome e estado em palavra, sem opinião inventada do passado', async () => {
    openBacktest();
    const lucas = await within(team()).findByRole('button', {
      name: /^Lucas, .*sem chave configurada/,
    });
    expect(lucas.textContent).toContain('◆ Lucas');
    expect(lucas.textContent).toContain('sem chave configurada');
    const olivia = within(team()).getByRole('button', { name: /^Olívia, .*pronto/ });
    expect(olivia.textContent).toContain('OpenAI');
    expect(
      within(team()).getAllByText('Equipes de modelo não opinam sobre o passado.'),
    ).toHaveLength(2);
    expect(within(team()).queryByText('comprar')).toBeNull();
    expect(within(team()).queryByText('carregando')).toBeNull();
  });

  test('a equipe desligada não aparece: nem personagem nem chip', async () => {
    openBacktest();
    await within(team()).findByRole('button', { name: /^Olívia, / });
    expect(within(team()).queryByRole('button', { name: /^Nina, / })).toBeNull();
    expect(within(team()).queryByText('desligada')).toBeNull();
  });

  test('nenhuma equipe ligada: a seção de equipes some e fica só o link discreto para Conta', async () => {
    openBacktest([
      buildTeamView('nina', { isEnabled: false }),
      buildTeamView('lucas', { isEnabled: false }),
      buildTeamView('olivia', { isEnabled: false }),
    ]);
    const link = await within(team()).findByRole('link', {
      name: 'Equipes de modelo (desligadas) · ligar em Conta',
    });
    expect(link.getAttribute('href')).toBe('/conta#equipes');
    expect(team().textContent).not.toContain('EQUIPES DE MODELO');
    expect(within(team()).queryByRole('button', { name: /equipe de modelo/ })).toBeNull();
  });
});

describe('as equipes ◆ ao vivo como personagens', () => {
  test('a Olívia com análises "esperar" aparece com figura, nome, estado e o motivo; a desligada some e a sem chave fica esmaecida com o motivo', async () => {
    const harness = createModelTeamsHarness(
      buildRunModelTeams({
        teams: [
          buildTeamState('nina', { team: buildTeamView('nina', { isEnabled: false }), recent: [] }),
          buildTeamState('lucas', { team: buildNoKeyTeam('lucas'), recent: [] }),
          buildTeamState('olivia', {
            recent: [buildRecommendation('olivia', { action: 'hold', actionLabel: 'esperar' })],
          }),
        ],
      }),
    );
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
    const crew = await findRoomModelTeams();
    const olivia = await within(crew).findByRole('button', { name: /^Olívia, .*esperar/ });
    const slot = olivia.closest('li');
    expect(slot?.getAttribute('data-kind')).toBe('model');
    expect(slot?.querySelector('svg')).not.toBeNull();
    expect(slot?.textContent).toContain('Entrada perto do fechamento.');
    expect(within(crew).queryByRole('button', { name: /^Nina, / })).toBeNull();
    expect(crew.textContent).not.toContain('Desligada nas preferências');
    const lucas = within(crew).getByRole('button', { name: /^Lucas, .*sem chave configurada/ });
    expect(lucas.closest('li')?.textContent).toContain('sem chave configurada: não opina.');
  });
});
