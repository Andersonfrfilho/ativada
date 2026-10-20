// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildChartResponse, buildSummaryResponse } from './trade-chart-fixtures.js';
import {
  dataResponse,
  errorResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './fake-fetch.js';
import { FIXTURE_CANDLE_TIME, buildLiveStatusResponse } from './live-status-fixtures.js';
import { renderApp, type RenderedApp } from './render-app.js';
import { buildRun, buildStrategy, buildVersion } from './run-fixtures.js';

export const LIVE_RUN_ID = 'run-live';
export const LIVE_BASE = `/v1/runs/${LIVE_RUN_ID}`;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
// A simulação nasceu 1 h antes da primeira vela do fixture (2026-01-01T00:00Z).
export const LIVE_PERIOD_START = FIXTURE_CANDLE_TIME - HOUR;

// A seção "run" do live-status do fixture (rodando, 1 h de vela), com o que o teste quiser mudar.
export function buildRunSection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LIVE_RUN_ID,
    status: 'running',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: LIVE_PERIOD_START,
    lastCandleTime: FIXTURE_CANDLE_TIME,
    lastDecisionAt: FIXTURE_CANDLE_TIME + HOUR,
    nextDecisionAt: FIXTURE_CANDLE_TIME + 2 * HOUR,
    waitingForData: null,
    ...overrides,
  };
}

export type LiveHarness = {
  // O que o servidor responde agora; o teste troca o valor e dispara o aviso do stream.
  liveStatus: Record<string, unknown>;
  // Liga a falha do servidor no live-status (a tela já carregada deve continuar de pé).
  isLiveStatusFailing: boolean;
  decisionPages: Array<{ items: unknown[]; nextCursor: string | null }>;
  tradeSummary: Record<string, unknown>;
  run: Record<string, unknown>;
};

export function createLiveHarness(overrides: Partial<LiveHarness> = {}): LiveHarness {
  return {
    liveStatus: buildLiveStatusResponse(),
    isLiveStatusFailing: false,
    decisionPages: [],
    tradeSummary: buildSummaryResponse({
      closedTrades: 0,
      openTrades: 0,
      totalPaid: '0',
      totalReceived: '0',
      totalFees: '0',
      net: '0',
      message: 'Nenhuma operação.',
    }),
    run: buildRun({
      id: LIVE_RUN_ID,
      kind: 'live_paper',
      status: 'running',
      timeframe: '1h',
      periodStart: LIVE_PERIOD_START,
      periodEnd: null,
      progress: 0,
      metrics: null,
      goalId: null,
    }),
    ...overrides,
  };
}

function decisionsResponse(harness: LiveHarness, call: RecordedCall): Response {
  const cursor = call.query.get('cursor');
  const index = cursor === null ? 0 : Number(cursor.replace('page-', ''));
  const page = harness.decisionPages[index] ?? { items: [], nextCursor: null };
  return pageResponse(page.items, page.nextCursor);
}

export function liveRoutes(harness: LiveHarness): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response => pageResponse([buildStrategy()]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-1/versions',
      respond: (): Response => pageResponse([buildVersion()]),
    },
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
    { method: 'GET', path: LIVE_BASE, respond: (): Response => dataResponse(harness.run) },
    { method: 'GET', path: `${LIVE_BASE}/trades`, respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: `${LIVE_BASE}/chart`,
      respond: (): Response => dataResponse(buildChartResponse()),
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/trade-summary`,
      respond: (): Response => dataResponse(harness.tradeSummary),
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/live-status`,
      respond: (): Response =>
        harness.isLiveStatusFailing
          ? errorResponse(503, 'UNAVAILABLE')
          : dataResponse(harness.liveStatus),
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/decisions`,
      respond: (call): Response => decisionsResponse(harness, call),
    },
  ];
}

// `hash` abre uma aba da simulação ao vivo (`#acompanhamento`, `#decisoes`, `#falta`, `#acertos`); sem ela, "Operações".
export function openLiveDetail(harness: LiveHarness, hash = ''): RenderedApp {
  return renderApp({
    path: `/backtests/${LIVE_RUN_ID}${hash}`,
    isAuthenticated: true,
    routes: liveRoutes(harness),
  });
}

// Uma decisão com tudo preenchido; `hour` desloca a vela para trás a partir do fixture.
export function buildDecisionAt(
  hoursBefore: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const candleTime = FIXTURE_CANDLE_TIME - hoursBefore * HOUR;
  return {
    candleTime,
    closedAt: candleTime + HOUR,
    close: '100.5',
    action: 'HOLD',
    outcome: 'waited',
    score: '1',
    scoreThreshold: '2',
    regime: 'none',
    message: 'Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
    technicalReason: 'score 1 < buy 2',
    votes: [
      {
        ruleId: 'rsi-14',
        label: 'RSI',
        kind: 'rsi',
        vote: 0,
        weight: '1',
        isMissing: false,
        reading: { value: '55' },
      },
    ],
    ...overrides,
  };
}
