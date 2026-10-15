// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ChartSurfaceLoaderContext } from '../../src/runs/candle-chart/chart-surface-loader.js';
import { TradeChartCard } from '../../src/runs/TradeChartCard.component.js';
import {
  buildFixtureChart,
  FIXTURE_FROM,
  FIXTURE_HOUR,
  FIXTURE_TO,
} from '../fixtures/trade-chart.fixture.js';
import { dataResponse, pageResponse, type FakeRoute, type RecordedCall } from './fake-fetch.js';
import { createFakeSurfaceFactory, type FakeChartSurface } from './fake-chart-surface.js';
import { renderApp, type RenderedApp } from './render-app.js';
import { buildRun } from './run-fixtures.js';
import { buildSummaryResponse } from './trade-chart-fixtures.js';

// O cartão "Preço e operações" inteiro com a superfície falsa no lugar da biblioteca e velas geradas pelo pedido.
export const CANDLES_PATH = '/v1/markets/candles';

export type CandleCardOptions = {
  readonly search?: string;
  readonly runDays?: number;
  readonly build?: (overrides: Record<string, unknown>) => Record<string, unknown>;
  readonly respondCandles?: (call: RecordedCall) => Response | Promise<Response>;
  readonly respondChart?: (call: RecordedCall) => Response | Promise<Response>;
  readonly extraRoutes?: readonly FakeRoute[];
};

export type CandleCardHarness = {
  readonly app: RenderedApp;
  readonly router: ReturnType<typeof createMemoryRouter>;
  readonly surfaces: FakeChartSurface[];
  readonly candleCalls: () => RecordedCall[];
  readonly chartCalls: () => RecordedCall[];
};

// Velas de 1 h geradas para o pedido `[from, to)`: o preço anda devagar e o volume cresce com o tempo.
export function buildCandlesBetween(
  from: number,
  to: number,
  step: number,
): Record<string, unknown>[] {
  const candles: Record<string, unknown>[] = [];
  for (let openTime = from; openTime < to; openTime += step) {
    const slot = Math.round(openTime / step);
    const open = 600 + (slot % 23);
    candles.push({
      openTime,
      closeTime: openTime + step - 1,
      open: `${open}.00000000`,
      high: `${open + 3}.50000000`,
      low: `${open - 2}.00000000`,
      close: `${open + 1}.25000000`,
      volume: `${1000 + (slot % 97)}.00000000`,
      tradeCount: 120,
    });
  }
  return candles;
}

export function timeframeStep(timeframe: string | null): number {
  if (timeframe === '4h') return 4 * FIXTURE_HOUR;
  if (timeframe === '1d') return 24 * FIXTURE_HOUR;
  if (timeframe === '15m') return FIXTURE_HOUR / 4;
  return FIXTURE_HOUR;
}

function candlesRoute(options: CandleCardOptions): FakeRoute {
  return {
    method: 'GET',
    path: CANDLES_PATH,
    respond: (call): Response | Promise<Response> => {
      if (options.respondCandles !== undefined) return options.respondCandles(call);
      const step = timeframeStep(call.query.get('timeframe'));
      const from = Number(call.query.get('from'));
      const to = Number(call.query.get('to'));
      return dataResponse(buildCandlesBetween(from, to, step));
    },
  };
}

function baseRoutes(options: CandleCardOptions): FakeRoute[] {
  const runDays = options.runDays ?? 40;
  const runTo = FIXTURE_FROM + runDays * 24 * FIXTURE_HOUR;
  const build = options.build ?? buildFixtureChart;
  return [
    {
      method: 'GET',
      path: '/v1/me',
      respond: (): Response =>
        dataResponse({
          id: 'user-1',
          displayName: null,
          displayCurrency: 'BRL',
          timezone: 'America/Sao_Paulo',
          alertTelegramEnabled: false,
          telegramLinked: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1',
      respond: (): Response =>
        dataResponse(
          buildRun({
            symbol: 'BNBUSDT',
            timeframe: '1h',
            periodStart: FIXTURE_FROM,
            periodEnd: runTo,
          }),
        ),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/chart',
      respond: (call): Response | Promise<Response> => {
        if (options.respondChart !== undefined) return options.respondChart(call);
        const from = Number(call.query.get('from') ?? FIXTURE_FROM);
        const to = Number(call.query.get('to') ?? runTo);
        return dataResponse(build({ from, to, runRange: { from: FIXTURE_FROM, to: runTo } }));
      },
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/trade-summary',
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
    { method: 'GET', path: '/v1/runs/run-1/trades', respond: (): Response => pageResponse([]) },
  ];
}

export function showCandleCard(options: CandleCardOptions = {}): CandleCardHarness {
  const { factory, created } = createFakeSurfaceFactory();
  const router = createMemoryRouter(
    [{ path: '/runs/:runId', element: <TradeChartCard runId="run-1" /> }],
    { initialEntries: [`/runs/run-1${options.search ?? ''}`] },
  );
  const app = renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [...baseRoutes(options), candlesRoute(options), ...(options.extraRoutes ?? [])],
    probe: (
      <ChartSurfaceLoaderContext value={() => Promise.resolve(factory)}>
        <RouterProvider router={router} />
      </ChartSurfaceLoaderContext>
    ),
  });
  return {
    app,
    router,
    surfaces: created,
    candleCalls: () => app.fake.callsTo('GET', CANDLES_PATH),
    chartCalls: () => app.fake.callsTo('GET', '/v1/runs/run-1/chart'),
  };
}

export { FIXTURE_FROM, FIXTURE_HOUR, FIXTURE_TO };
