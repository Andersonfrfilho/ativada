// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { LiveMarketProvider } from '../../src/live/LiveMarketProvider.component.js';
import { ChartSurfaceLoaderContext } from '../../src/runs/candle-chart/chart-surface-loader.js';
import {
  TeamAsideProvider,
  type TeamAsideRenderer,
} from '../../src/runs/team-room/TeamAside.context.js';
import { TradeChartCard } from '../../src/runs/TradeChartCard.component.js';
import {
  buildFixtureChart,
  FIXTURE_FROM,
  FIXTURE_HOUR,
  FIXTURE_TO,
} from '../fixtures/trade-chart.fixture.js';
import {
  dataResponse,
  jsonResponse,
  errorResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './fake-fetch.js';
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
  // `live_paper` liga a previsão e o "esperou"; o padrão é um backtest.
  readonly kind?: string;
  // Campos da execução que o teste troca (por exemplo, `status` e `periodStart` de uma simulação sem nenhuma vela).
  readonly runOverrides?: Record<string, unknown>;
  readonly respondLayers?: (call: RecordedCall) => Response | Promise<Response>;
  readonly respondProjections?: (call: RecordedCall) => Response | Promise<Response>;
  // As operações fechadas que a tabela (e a camada "Stop e alvo") recebem.
  readonly trades?: readonly unknown[];
  // Só para provar o silêncio da vela em formação sem esperar 10 s.
  readonly silenceMilliseconds?: number;
  readonly marketTimeframes?: readonly string[];
  readonly marketDisplayTimeframes?: readonly string[];
  // O corte da retenção das velas de exibição que a rota devolve em `meta` (ms); sem ele, a resposta é a antiga.
  readonly retentionStart?: number;
  readonly oneMinuteRetentionStart?: number;
  // A equipe que a simulação ao vivo cola no gráfico (recebe a vela apontada).
  readonly aside?: TeamAsideRenderer;
};

export const LAYERS_PATH = '/v1/runs/run-1/strategy-layers';
export const PROJECTIONS_PATH = '/v1/runs/run-1/projections';

export type CandleCardHarness = {
  readonly app: RenderedApp;
  readonly router: ReturnType<typeof createMemoryRouter>;
  readonly surfaces: FakeChartSurface[];
  readonly candleCalls: () => RecordedCall[];
  readonly chartCalls: () => RecordedCall[];
  readonly layersCalls: () => RecordedCall[];
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
  if (timeframe === '3m') return FIXTURE_HOUR / 20;
  if (timeframe === '1m') return FIXTURE_HOUR / 60;
  return FIXTURE_HOUR;
}

// O corte da retenção de cada vela de exibição (a de 1 min tem o seu).
function retentionCutOf(timeframe: string | null, options: CandleCardOptions): number | undefined {
  if (timeframe === '3m') return options.retentionStart;
  return timeframe === '1m' ? options.oneMinuteRetentionStart : undefined;
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
      const cut = retentionCutOf(call.query.get('timeframe'), options);
      const candles = buildCandlesBetween(Math.max(from, cut ?? from), to, step);
      if (cut === undefined) return dataResponse(candles);
      return jsonResponse({ data: candles, meta: { retentionStart: cut } });
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
            kind: options.kind ?? 'backtest',
            periodStart: FIXTURE_FROM,
            periodEnd: runTo,
            ...options.runOverrides,
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
    {
      method: 'GET',
      path: '/v1/runs/run-1/trades',
      respond: (call): Response =>
        pageResponse(call.query.get('status') === 'closed' ? (options.trades ?? []) : []),
    },
    {
      method: 'GET',
      path: LAYERS_PATH,
      respond: (call): Response | Promise<Response> =>
        options.respondLayers?.(call) ?? errorResponse(404, 'LAYERS_NOT_FAKED'),
    },
    {
      method: 'GET',
      path: PROJECTIONS_PATH,
      respond: (call): Response | Promise<Response> =>
        options.respondProjections?.(call) ?? errorResponse(404, 'PROJECTIONS_NOT_FAKED'),
    },
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
    ...(options.silenceMilliseconds === undefined
      ? {}
      : { silenceMilliseconds: options.silenceMilliseconds }),
    ...(options.marketTimeframes === undefined
      ? {}
      : { marketTimeframes: options.marketTimeframes }),
    ...(options.marketDisplayTimeframes === undefined
      ? {}
      : { marketDisplayTimeframes: options.marketDisplayTimeframes }),
    probe: (
      <ChartSurfaceLoaderContext value={() => Promise.resolve(factory)}>
        <LiveMarketProvider>
          <TeamAsideProvider aside={options.aside}>
            <RouterProvider router={router} />
          </TeamAsideProvider>
        </LiveMarketProvider>
      </ChartSurfaceLoaderContext>
    ),
  });
  return {
    app,
    router,
    surfaces: created,
    candleCalls: () => app.fake.callsTo('GET', CANDLES_PATH),
    chartCalls: () => app.fake.callsTo('GET', '/v1/runs/run-1/chart'),
    layersCalls: () => app.fake.callsTo('GET', LAYERS_PATH),
  };
}

export { FIXTURE_FROM, FIXTURE_HOUR, FIXTURE_TO };
