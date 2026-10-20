// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { createAppRoutes } from '../src/app/createAppRoutes.js';
import { ChartSurfaceLoaderContext } from '../src/runs/candle-chart/chart-surface-loader.js';

import { CHART_PREFERENCES_STORAGE_KEY } from '../src/runs/candle-chart/candle-chart.constant.js';
import type { MarketCandle } from '../src/runs/candle-chart/market-candles.validation.js';
import { computeMovingAverage } from '../src/runs/candle-chart/moving-average.js';
import { TerminalChartProvider } from '../src/runs/candle-chart/terminal-chart.context.js';
import { useAverageLines } from '../src/runs/candle-chart/useAverageLines.hook.js';
import { buildCandlesBetween, CANDLES_PATH, timeframeStep } from './support/candle-card-harness.js';
import { createFakeChartSurface, createFakeSurfaceFactory } from './support/fake-chart-surface.js';
import { dataResponse, type FakeRoute } from './support/fake-fetch.js';
import {
  createLiveHarness,
  LIVE_RUN_ID,
  liveRoutes,
  openLiveDetail,
} from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';

// Spec 011, Fase 3, S1: o telão-terminal (médias de desenho, cabeçalho com as variações uma vez só).

afterEach(cleanup);

function candlesOf(closes: readonly string[]): MarketCandle[] {
  return closes.map((close, index) => ({
    openTime: index * 60_000,
    closeTime: index * 60_000 + 59_999,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1',
    tradeCount: 1,
  }));
}

describe('moving averages (drawing only)', () => {
  test('averages the last N closes once the window is full, worked by hand', () => {
    const candles = [1, 2, 3, 4, 5].map((close, index) => ({
      time: index,
      open: close,
      high: close,
      low: close,
      close,
    }));
    expect(computeMovingAverage(candles, 20).points).toEqual([]);
    const shortWindow = computeMovingAverage(
      Array.from({ length: 22 }, (_, index) => ({
        time: index,
        open: 0,
        high: 0,
        low: 0,
        close: index + 1,
      })),
      20,
    );
    // (1..20)/20 = 10,5; (2..21)/20 = 11,5; (3..22)/20 = 12,5
    expect(shortWindow.points).toEqual([
      { time: 19, value: 10.5 },
      { time: 20, value: 11.5 },
      { time: 21, value: 12.5 },
    ]);
  });
});

function Probe({ candles }: { readonly candles: readonly MarketCandle[] }): ReactElement {
  const surface = useFakeSurface();
  useAverageLines(surface, candles);
  return <p>probe</p>;
}

const SURFACE = createFakeChartSurface(document.createElement('div'));
function useFakeSurface(): typeof SURFACE {
  return SURFACE;
}

describe('averages reach the surface only inside the terminal', () => {
  test('outside the terminal nothing is pushed; inside, MA20 and MA50', () => {
    const candles = candlesOf(Array.from({ length: 60 }, (_, index) => String(index + 1)));
    render(<Probe candles={candles} />);
    expect(SURFACE.callsOf('setAverages')).toEqual([]);
    cleanup();
    render(
      <TerminalChartProvider>
        <Probe candles={candles} />
      </TerminalChartProvider>,
    );
    const [averages] = SURFACE.callsOf('setAverages').at(-1) ?? [];
    expect(averages).toMatchObject([{ period: 20 }, { period: 50 }]);
  });
});

describe('the live detail page', () => {
  test('shows the price variations once, in the terminal header', async () => {
    openLiveDetail(createLiveHarness());
    const terminal = await screen.findByRole('region', { name: 'Telão: gráfico da simulação' });
    expect(within(terminal).getByRole('heading', { name: 'BTC/USDT' })).toBeTruthy();
    expect(within(terminal).getByText('vela de 1 hora')).toBeTruthy();
    expect(
      within(terminal).getByRole('list', { name: 'Variação do preço por período' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('list', { name: 'Variação do preço por período' })).toHaveLength(1);
    const room = screen.getByRole('region', { name: 'Sala de operações' });
    expect(room.textContent).toContain('Simulação com dinheiro fictício · Tendência, não promessa');
  });

  test('keeps the next-candle prediction beside the chart even with the forecast layer off', async () => {
    localStorage.setItem(
      CHART_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ layers: { forecast: false }, isTooltipOn: true }),
    );
    const { factory } = createFakeSurfaceFactory();
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [`/backtests/${LIVE_RUN_ID}`],
    });
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [...liveRoutes(createLiveHarness()), candlesRoute()],
      probe: (
        <ChartSurfaceLoaderContext value={() => Promise.resolve(factory)}>
          <RouterProvider router={router} />
        </ChartSurfaceLoaderContext>
      ),
    });
    const terminal = await screen.findByRole('region', { name: 'Telão: gráfico da simulação' });
    expect(
      await within(terminal).findByRole('heading', { name: 'Próxima vela de perto' }),
    ).toBeTruthy();
    localStorage.removeItem(CHART_PREFERENCES_STORAGE_KEY);
  });
});

function candlesRoute(): FakeRoute {
  return {
    method: 'GET',
    path: CANDLES_PATH,
    respond: (call): Response =>
      dataResponse(
        buildCandlesBetween(
          Number(call.query.get('from')),
          Number(call.query.get('to')),
          timeframeStep(call.query.get('timeframe')),
        ),
      ),
  };
}
