// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen, waitFor } from '@testing-library/react';

import { renderHistoricalTeam } from '../src/runs/team-room/HistoricalTeam.component.js';
import { RunTeamAside } from '../src/runs/team-room/RunTeamAside.component.js';
import { TeamAside } from '../src/runs/team-room/TeamAside.context.js';
import { buildFixtureChart } from './fixtures/trade-chart.fixture.js';
import { showCandleCard } from './support/candle-card-harness.js';
import { errorResponse } from './support/fake-fetch.js';
import { LIVE_RUN_ID, openLiveDetail } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TEAM_NAME = { name: 'Equipe agora' } as const;

describe('o gráfico reserva a coluna da equipe em todo estado', () => {
  const aside = (): ReactElement => <p data-testid="team">equipe</p>;

  test('a backtest chart gets the team column, and it stays even when the server refuses', async () => {
    showCandleCard({ aside: renderHistoricalTeam(LIVE_RUN_ID, '1h') });
    await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
    const team = await screen.findByRole('complementary', TEAM_NAME);
    expect(team).toBeDefined();
  });

  test('a run with no candle yet keeps the team beside the chart drawn with context candles', async () => {
    showCandleCard({
      kind: 'live_paper',
      aside,
      build: (overrides) => ({
        ...buildFixtureChart(overrides),
        runRange: { from: 1, to: 1 },
      }),
    });
    expect(await screen.findByText(/A simulação ainda não processou nenhuma vela/)).toBeDefined();
    expect(await screen.findByRole('img', { name: /Gráfico de velas de / })).toBeDefined();
    expect(await screen.findAllByTestId('team')).toHaveLength(1);
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
        <RunTeamAside runId={LIVE_RUN_ID} kind={kind} timeframe="1h">
          <TeamAside pointedOpenTime={undefined} />
        </RunTeamAside>
      ),
    });
  }

  test.each(['backtest', 'walk_forward'])(
    'a %s with no recorded opinion says so instead of leaving the column empty',
    async (kind) => {
      renderWithKind(kind);
      const team = await screen.findByRole('complementary', TEAM_NAME);
      await waitFor(() => expect(team.textContent).toContain('não gravou nenhuma opinião'));
    },
  );

  test('a finished live run has no column beside the chart: the team is in the trading room', async () => {
    renderWithKind('live_paper');
    await waitFor(() => expect(screen.queryByRole('complementary', TEAM_NAME)).toBeNull());
  });
});

describe('a sala de operações não esconde o gráfico', () => {
  test.each([
    ['without decisions', false],
    ['with the server refusing live-status', true],
  ])('%s the chart is still on the screen of the room', async (_name, isFailing) => {
    const harness = createRoomHarness([]);
    harness.isLiveStatusFailing = isFailing;
    openLiveDetail(harness);
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    const chart = await screen.findByRole('region', { name: 'Preço e operações' });
    expect(room.contains(chart)).toBe(true);
  });
});
