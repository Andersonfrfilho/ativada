// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderHistoricalTeam } from '../src/runs/team-room/BacktestTeam.component.js';
import { CompactTeam } from '../src/runs/team-room/CompactTeam.component.js';
import { RunTeamAside } from '../src/runs/team-room/RunTeamAside.component.js';
import { TeamAside } from '../src/runs/team-room/TeamAside.context.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import { buildFixtureChart } from './fixtures/trade-chart.fixture.js';
import { showCandleCard } from './support/candle-card-harness.js';
import { errorResponse } from './support/fake-fetch.js';
import { LIVE_RUN_ID, openLiveDetail, type LiveHarness } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import {
  buildRoomLiveStatus,
  createRoomHarness,
  DEFAULT_VOTES,
  roomRoutes,
} from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TEAM_NAME = { name: 'Equipe agora' } as const;

function openCompactTeam(harness: LiveHarness): void {
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: roomRoutes(harness),
    probe: <CompactTeam runId={LIVE_RUN_ID} />,
  });
}

// A coluna troca de moldura quando a resposta chega: cada espera relê o elemento.
async function teamText(expected: string): Promise<string> {
  await waitFor(() => expect(teamNow()).toContain(expected));
  return teamNow();
}

function teamNow(): string {
  return screen.getByRole('complementary', TEAM_NAME).textContent ?? '';
}

describe('a equipe junto do gráfico nunca some', () => {
  test('a run with no decision yet says the team is watching and when the first opinion arrives', async () => {
    openCompactTeam(createRoomHarness([]));
    const text = await teamText('A equipe ainda está olhando o mercado.');
    expect(text).toMatch(
      /A primeira opinião chega quando a vela de 1 hora fechar às [0-9]{2}:[0-9]{2}./,
    );
  });

  test('a stopped run with no decision says it is not running instead of promising an opinion', async () => {
    const harness = createRoomHarness([]);
    harness.liveStatus = buildRoomLiveStatus([], DEFAULT_VOTES, { status: 'cancelled' });
    openCompactTeam(harness);
    expect(await teamText('não está rodando')).not.toContain('A primeira opinião chega');
  });

  test('while loading it holds its place, and when the server refuses it offers to try again', async () => {
    const harness = createRoomHarness();
    harness.isLiveStatusFailing = true;
    openCompactTeam(harness);
    await teamText('Não deu para carregar a equipe agora.');
    harness.isLiveStatusFailing = false;
    fireEvent.click(
      within(screen.getByRole('complementary', TEAM_NAME)).getByRole('button', {
        name: 'Tentar de novo',
      }),
    );
    await teamText('Vela que fechou');
  });
});

describe('o gráfico reserva a coluna da equipe em todo estado', () => {
  const aside = (): ReactElement => <p data-testid="team">equipe</p>;

  test('a backtest chart gets the team column with an honest sentence', async () => {
    showCandleCard({ aside: renderHistoricalTeam });
    await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
    const team = await screen.findByRole('complementary', TEAM_NAME);
    expect(team.textContent).toContain('roda sobre o passado');
    expect(team.textContent).toContain('compras e vendas estão marcadas no gráfico');
  });

  test('a run with no candle yet keeps the team beside the empty-chart notice', async () => {
    showCandleCard({
      kind: 'live_paper',
      aside,
      build: (overrides) => ({
        ...buildFixtureChart(overrides),
        runRange: { from: 1, to: 1 },
      }),
    });
    expect(await screen.findByText('Ainda não há velas para mostrar.')).toBeDefined();
    expect(await screen.findByTestId('team')).toBeDefined();
  });

  test('when the public candles are missing the simple chart still has the team beside it', async () => {
    showCandleCard({
      kind: 'live_paper',
      aside,
      respondCandles: () => errorResponse(404, 'CANDLES_NOT_FOUND'),
    });
    expect(await screen.findByText(/As velas deste par não estão disponíveis/)).toBeDefined();
    expect(await screen.findByTestId('team')).toBeDefined();
  });

  test('without any team provider the chart keeps its own layout', async () => {
    showCandleCard({ kind: 'backtest' });
    await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
    expect(screen.queryByRole('complementary', TEAM_NAME)).toBeNull();
  });
});

describe('RunTeamAside: a execução terminada', () => {
  function renderWithKind(kind: string): void {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: roomRoutes(createRoomHarness()),
      probe: (
        <RunTeamAside runId={LIVE_RUN_ID} kind={kind}>
          <TeamAside pointedOpenTime={undefined} />
        </RunTeamAside>
      ),
    });
  }

  test.each(['backtest', 'walk_forward'])(
    'a %s says the team only speaks on live runs',
    async (kind) => {
      renderWithKind(kind);
      const team = await screen.findByRole('complementary', TEAM_NAME);
      expect(team.textContent).toContain('roda sobre o passado');
    },
  );

  test('a finished live run keeps the recorded opinion of the team', async () => {
    renderWithKind('live_paper');
    const team = await screen.findByRole('complementary', TEAM_NAME);
    await waitFor(() => expect(team.textContent).toContain('Vela que fechou'));
  });
});

describe('a preferência "Sala com o gráfico" não esconde nada', () => {
  function chooseRoomLayout(): void {
    localStorage.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify({ layout: 'room_with_chart' }));
  }

  test.each([
    ['without decisions', false],
    ['with the server refusing live-status', true],
  ])(
    '%s the chart is still on the page and the way back is one click away',
    async (_name, isFailing) => {
      chooseRoomLayout();
      const harness = createRoomHarness([]);
      harness.isLiveStatusFailing = isFailing;
      openLiveDetail(harness);
      expect(await screen.findByRole('region', { name: 'Preço e operações' })).toBeDefined();
      const back = await screen.findByRole('button', { name: 'Gráfico + equipe' });
      expect(back.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(back);
      expect(await screen.findByRole('complementary', TEAM_NAME)).toBeDefined();
      expect(localStorage.getItem(TEAM_ROOM_STORAGE_KEY)).toContain('chart_and_team');
    },
  );
});
