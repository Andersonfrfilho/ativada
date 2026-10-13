// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { useQueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { tradeSchema } from '../src/runs/run.validation.js';
import { useTradesQuery } from '../src/runs/runs.query.js';
import { useTradeChartQuery, useTradeSummaryQuery } from '../src/runs/trade-chart.query.js';
import { tradeChartSchema } from '../src/runs/trade-chart.validation.js';
import { tradeSummarySchema } from '../src/runs/trade-summary.validation.js';
import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import { buildChartResponse, buildSummaryResponse } from './support/trade-chart-fixtures.js';

function ChartProbe(): ReactElement {
  const chart = useTradeChartQuery({ runId: 'run-1', from: 10, to: 20, columns: 300 });
  const queryClient = useQueryClient();
  const keys = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => String(query.queryKey[0]));
  return (
    <p>
      {chart.isSuccess ? `velas:${chart.data.columns.length}` : chart.status}|{keys.join(',')}
    </p>
  );
}

function SummaryProbe(): ReactElement {
  const summary = useTradeSummaryQuery('run-1');
  return <p>{summary.isSuccess ? summary.data.message : summary.status}</p>;
}

function TradesProbe(): ReactElement {
  const trades = useTradesQuery('run-1', { from: 5, to: 9, status: 'closed' });
  return <p>{trades.isSuccess ? `n:${trades.data.pages[0]?.items.length}` : trades.status}</p>;
}

describe('trade chart schema', () => {
  test('accepts the server shape, with markers or with clusters', () => {
    expect(tradeChartSchema.safeParse(buildChartResponse()).success).toBe(true);
    const grouped = buildChartResponse({
      markers: null,
      clusters: [{ startTime: 1, endTime: 2, buys: 3, sells: 4 }],
    });
    expect(tradeChartSchema.safeParse(grouped).success).toBe(true);
  });

  test('rejects a non-decimal price, an unknown side and a missing field', () => {
    const badPrice = buildChartResponse({
      columns: [{ startTime: 1, endTime: 2, first: 'NaN', last: '1', low: '1', high: '1' }],
    });
    expect(tradeChartSchema.safeParse(badPrice).success).toBe(false);
    const badSide = buildChartResponse({
      markers: [
        {
          positionKey: 'p',
          side: 'hold',
          candleTime: 1,
          price: '1',
          quantity: '1',
          fee: '0',
          amount: '1',
        },
      ],
    });
    expect(tradeChartSchema.safeParse(badSide).success).toBe(false);
    expect(tradeChartSchema.safeParse({ ...buildChartResponse(), totals: undefined }).success).toBe(
      false,
    );
  });
});

describe('trade summary schema', () => {
  test('accepts the server shape and rejects a number where text is expected', () => {
    expect(tradeSummarySchema.safeParse(buildSummaryResponse()).success).toBe(true);
    expect(tradeSummarySchema.safeParse(buildSummaryResponse({ net: 1.09 })).success).toBe(false);
    expect(tradeSummarySchema.safeParse(buildSummaryResponse({ openPaid: '412.00' })).success).toBe(
      true,
    );
  });
});

describe('trade schema keeps the old fields and accepts the new ones', () => {
  const old = {
    engineKey: 'p1',
    status: 'open',
    entryPrice: '100',
    quantity: '1',
    openedCandleTime: 1,
  };

  test('an old row without the new fields still parses', () => {
    expect(tradeSchema.safeParse(old).success).toBe(true);
  });

  test('the new fields are exact decimal text', () => {
    const next = { ...old, paid: '100.1', received: '101', fees: '0.2', netProfitRate: '-0.0012' };
    expect(tradeSchema.safeParse(next).success).toBe(true);
    expect(tradeSchema.safeParse({ ...next, paid: 100.1 }).success).toBe(false);
  });
});

describe('queries', () => {
  test('the chart query sends the range and columns and its key starts with "runs"', async () => {
    const routes: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/chart',
        respond: (): Response => dataResponse(buildChartResponse()),
      },
    ];
    const { fake } = renderApp({ path: '/', isAuthenticated: true, routes, probe: <ChartProbe /> });
    expect(await screen.findByText(/velas:1/)).toBeDefined();
    const query = fake.callsTo('GET', '/v1/runs/run-1/chart')[0]?.query;
    expect([query?.get('from'), query?.get('to'), query?.get('columns')]).toEqual([
      '10',
      '20',
      '300',
    ]);
    expect(screen.getByText(/\|runs$/)).toBeDefined();
  });

  test('an invalid chart response renders nothing from the data', async () => {
    const routes: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/chart',
        respond: (): Response => dataResponse(buildChartResponse({ columns: 'x' })),
      },
    ];
    renderApp({ path: '/', isAuthenticated: true, routes, probe: <ChartProbe /> });
    expect(await screen.findByText(/^error/)).toBeDefined();
    expect(screen.queryByText(/velas:/)).toBeNull();
  });

  test('the summary query shows the server sentence and refuses a bad shape', async () => {
    const good: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/trade-summary',
        respond: (): Response => dataResponse(buildSummaryResponse()),
      },
    ];
    renderApp({ path: '/', isAuthenticated: true, routes: good, probe: <SummaryProbe /> });
    expect(await screen.findByText(/Você pagou 201,20 USDT/)).toBeDefined();
  });

  test('the summary query with a bad shape ends in error', async () => {
    const bad: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/trade-summary',
        respond: (): Response => dataResponse({ message: 'x' }),
      },
    ];
    renderApp({ path: '/', isAuthenticated: true, routes: bad, probe: <SummaryProbe /> });
    await waitFor(() => expect(screen.getByText('error')).toBeDefined());
  });

  test('the trades query sends from, to and status', async () => {
    const routes: readonly FakeRoute[] = [
      { method: 'GET', path: '/v1/runs/run-1/trades', respond: (): Response => pageResponse([]) },
    ];
    const { fake } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes,
      probe: <TradesProbe />,
    });
    expect(await screen.findByText('n:0')).toBeDefined();
    const query = fake.callsTo('GET', '/v1/runs/run-1/trades')[0]?.query;
    expect([query?.get('from'), query?.get('to'), query?.get('status')]).toEqual([
      '5',
      '9',
      'closed',
    ]);
  });
});
