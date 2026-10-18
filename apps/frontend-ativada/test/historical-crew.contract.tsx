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
import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TeamBalcony } from '../src/runs/team-room/balcony/TeamBalcony.component.js';
import { findLoadedTeam } from './support/loaded-team.js';
import { renderApp } from './support/render-app.js';
import { buildRoomDecision, createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const FIRST_CANDLE = 1_767_225_600_000;
const CREW = ['Tiago', 'Renata', 'Alice', 'Vitor', 'Sofia', 'Otávio'] as const;

function openBacktest(): void {
  // Olívia ligada, Nina desligada, Lucas sem chave; a rota das equipes da execução recusa (backtest não é ao vivo).
  const harness = createModelTeamsHarness('absent');
  harness.myTeams = [
    buildTeamView('nina', { isEnabled: false }),
    buildNoKeyTeam('lucas'),
    buildTeamView('olivia'),
  ];
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
    const nina = await within(team()).findByRole('button', { name: /^Nina, .*desligada/ });
    expect(nina.textContent).toContain('◆ Nina');
    const lucas = within(team()).getByRole('button', { name: /^Lucas, .*sem chave configurada/ });
    expect(lucas.textContent).toContain('sem chave configurada');
    const olivia = within(team()).getByRole('button', { name: /^Olívia, .*pronto/ });
    expect(olivia.textContent).toContain('OpenAI');
    expect(
      within(team()).getAllByText('Equipes de modelo não opinam sobre o passado.'),
    ).toHaveLength(3);
    expect(within(team()).queryByText('comprar')).toBeNull();
    expect(within(team()).queryByText('carregando')).toBeNull();
  });
});

describe('as equipes ◆ ao vivo como personagens', () => {
  test('a Olívia com análises "esperar" aparece com figura, nome, estado e o motivo; a desligada fica esmaecida com o motivo', async () => {
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
          <TeamBalcony runId={LIVE_RUN_ID} />
        </LiveMarketProvider>
      ),
    });
    const crew = await findLoadedTeam();
    const olivia = await within(crew).findByRole('button', { name: /^Olívia, .*esperar/ });
    const slot = olivia.closest('li');
    expect(slot?.getAttribute('data-kind')).toBe('model');
    expect(slot?.querySelector('svg')).not.toBeNull();
    expect(slot?.textContent).toContain('Entrada perto do fechamento.');
    const nina = within(crew).getByRole('button', { name: /^Nina, .*desligada/ });
    expect(nina.closest('li')?.textContent).toContain('Desligada nas preferências: não opina.');
    const lucas = within(crew).getByRole('button', { name: /^Lucas, .*sem chave configurada/ });
    expect(lucas.closest('li')?.textContent).toContain('sem chave configurada: não opina.');
  });
});
