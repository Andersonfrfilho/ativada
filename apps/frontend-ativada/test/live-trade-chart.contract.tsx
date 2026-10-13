// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import {
  buildFixtureChart,
  FIXTURE_FROM,
  FIXTURE_HOUR,
  FIXTURE_TO,
} from './fixtures/trade-chart.fixture.js';
import {
  dataResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';
import { buildSummaryResponse } from './support/trade-chart-fixtures.js';

const RUN_ID = 'run-live';
const BASE = `/v1/runs/${RUN_ID}`;
const CARD = { name: 'Preço e operações' } as const;
const FIRST_LAST_CLOSED = FIXTURE_TO - FIXTURE_HOUR;
const NEW_BUTTON = { name: 'Há velas novas — ir para o fim' } as const;

// O servidor do teste: cada vela nova fechada traz uma compra nova; a faixa pedida é recortada em "última vela + 1 h".
type LiveServer = { lastClosed: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function candleTimeOf(marker: Record<string, unknown>): number {
  const time = marker['candleTime'];
  return typeof time === 'number' ? time : Number.NaN;
}

function chartFor(server: LiveServer, call: RecordedCall): Response {
  const end = server.lastClosed + FIXTURE_HOUR;
  const from = Number(call.query.get('from') ?? FIXTURE_FROM);
  const to = Math.min(Number(call.query.get('to') ?? end), end);
  const base = buildFixtureChart({ from, to, lastClosedCandleTime: server.lastClosed });
  const rawMarkers: unknown = base['markers'];
  const baseMarkers = Array.isArray(rawMarkers) ? rawMarkers.filter(isRecord) : [];
  const hasNewBuy = server.lastClosed > FIRST_LAST_CLOSED;
  const newBuy = {
    positionKey: 'p4',
    side: 'buy',
    candleTime: server.lastClosed,
    price: '650',
    quantity: '0.1',
    fee: '0.065',
    amount: '65.065',
  };
  const all = hasNewBuy ? [...baseMarkers, newBuy] : baseMarkers;
  const inRange = all.filter((marker) => candleTimeOf(marker) >= from && candleTimeOf(marker) < to);
  return dataResponse({ ...base, markers: inRange, totals: { buys: 0, sells: 0 } });
}

function routes(server: LiveServer, run: Record<string, unknown>): readonly FakeRoute[] {
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
    { method: 'GET', path: BASE, respond: (): Response => dataResponse(run) },
    { method: 'GET', path: `${BASE}/trades`, respond: (): Response => pageResponse([]) },
    { method: 'GET', path: `${BASE}/chart`, respond: (call) => chartFor(server, call) },
    {
      method: 'GET',
      path: `${BASE}/trade-summary`,
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
  ];
}

function liveRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return buildRun({
    id: RUN_ID,
    kind: 'live_paper',
    status: 'running',
    timeframe: '1h',
    periodStart: FIXTURE_FROM,
    periodEnd: null,
    progress: 0,
    metrics: null,
    ...overrides,
  });
}

function open(
  search: string = '',
  run: Record<string, unknown> = liveRun(),
): { readonly app: RenderedApp; readonly server: LiveServer } {
  const server: LiveServer = { lastClosed: FIRST_LAST_CLOSED };
  const app = renderApp({
    path: `/backtests/${RUN_ID}${search}`,
    isAuthenticated: true,
    routes: routes(server, run),
  });
  return { app, server };
}

function chartItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-chart-item]'));
}

function emitRunEvent(app: RenderedApp): void {
  act(() =>
    app.stream.emit({ type: 'event', runId: RUN_ID, kind: 'fill', eventId: 'e1', at: FIXTURE_TO }),
  );
}

function lastChartQuery(app: RenderedApp): URLSearchParams | undefined {
  return app.fake.callsTo('GET', `${BASE}/chart`).at(-1)?.query;
}

const FIXED_SEARCH = `?de=${new Date(FIXTURE_FROM).toISOString()}&ate=${new Date(FIRST_LAST_CLOSED + 1).toISOString()}`;

describe('cartão "Preço e operações" na simulação ao vivo', () => {
  test('follows the end: a stream notice brings the new arrow and moves the label', async () => {
    const { app, server } = open();
    await screen.findByRole('region', CARD);
    await waitFor(() => expect(chartItems()).toHaveLength(6));
    expect(screen.getByText(/Acompanhando o fim da simulação/)).toBeDefined();
    expect(screen.getByText(/última vela fechada às 21:00/)).toBeDefined();
    expect(screen.queryByRole('button', NEW_BUTTON)).toBeNull();

    server.lastClosed += FIXTURE_HOUR;
    emitRunEvent(app);

    await waitFor(() => expect(chartItems()).toHaveLength(7));
    expect(screen.getByText(/última vela fechada às 22:00/)).toBeDefined();
    expect(screen.queryByRole('button', NEW_BUTTON)).toBeNull();
    expect(lastChartQuery(app)?.has('to')).toBe(false);
  });

  test('with a fixed range the range does not move and the "go to the end" notice appears', async () => {
    const { app, server } = open(FIXED_SEARCH);
    await waitFor(() => expect(chartItems()).toHaveLength(6));
    expect(screen.getByText(/Faixa fixa/)).toBeDefined();
    expect(screen.queryByRole('button', NEW_BUTTON)).toBeNull();
    const fixedTo = String(FIRST_LAST_CLOSED + 1);
    expect(lastChartQuery(app)?.get('to')).toBe(fixedTo);

    const callsBefore = app.fake.callsTo('GET', `${BASE}/chart`).length;
    server.lastClosed += FIXTURE_HOUR;
    emitRunEvent(app);

    expect(await screen.findByRole('button', NEW_BUTTON)).toBeDefined();
    expect(app.fake.callsTo('GET', `${BASE}/chart`).length).toBeGreaterThan(callsBefore);
    expect(lastChartQuery(app)?.get('to')).toBe(fixedTo);
    expect(chartItems()).toHaveLength(6);
    expect(app.router.state.location.search).toContain('ate=');
    expect(screen.getByText(/última vela fechada às 22:00/)).toBeDefined();
  });

  test('clicking the notice goes back to following the end and shows the new arrow', async () => {
    const { app, server } = open(FIXED_SEARCH);
    await waitFor(() => expect(chartItems()).toHaveLength(6));
    server.lastClosed += FIXTURE_HOUR;
    emitRunEvent(app);

    fireEvent.click(await screen.findByRole('button', NEW_BUTTON));

    await waitFor(() => expect(chartItems()).toHaveLength(7));
    expect(app.router.state.location.search).toBe('');
    expect(screen.getByText(/Acompanhando o fim da simulação/)).toBeDefined();
    expect(screen.queryByRole('button', NEW_BUTTON)).toBeNull();
  });

  test('is on the running live run only: a queued one keeps the progress alone', async () => {
    const { app } = open('', liveRun({ status: 'queued', queuePosition: { own: 1, overall: 1 } }));
    expect(await screen.findByText(/Posição na fila: 1/)).toBeDefined();
    expect(screen.queryByRole('region', CARD)).toBeNull();
    expect(app.fake.callsTo('GET', `${BASE}/chart`)).toHaveLength(0);
  });

  test('a backtest has neither the following text nor the notice', async () => {
    const backtest = buildRun({ id: RUN_ID, periodStart: FIXTURE_FROM, periodEnd: FIXTURE_TO });
    open('', backtest);
    await screen.findByRole('region', CARD);
    expect(screen.queryByText(/Acompanhando/)).toBeNull();
    expect(screen.queryByText(/última vela fechada/)).toBeNull();
  });
});
