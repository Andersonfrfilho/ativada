// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { useQueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import {
  useMarketCandlesQuery,
  useProjectionsPageQuery,
  useStrategyLayersQuery,
} from '../src/runs/candle-chart/candle-chart.query.js';
import { marketCandleSchema } from '../src/runs/candle-chart/market-candles.validation.js';
import {
  projectionsPageSchema,
  projectionsSchema,
} from '../src/runs/candle-chart/projections.validation.js';
import { strategyLayersSchema } from '../src/runs/candle-chart/strategy-layers.validation.js';
import { parseServerMessage } from '../src/live/stream.validation.js';
import {
  buildLayersResponse,
  buildMarketCandle,
  buildProjectionItem,
  buildProjectionsResponse,
  buildProjectionsSummary,
  buildStreamCandle,
  FIRST_CANDLE_TIME,
} from './support/candle-chart-fixtures.js';
import { dataResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

function rootsOf(queryClient: ReturnType<typeof useQueryClient>): string {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query) => String(query.queryKey[0]))
    .join(',');
}

function LayersProbe(): ReactElement {
  const layers = useStrategyLayersQuery({ runId: 'run-1', from: 10, to: 20 });
  const roots = rootsOf(useQueryClient());
  return (
    <p>
      {layers.isSuccess ? `velas:${layers.data.candleTimes.length}` : layers.status}|{roots}
    </p>
  );
}

function ProjectionsProbe(): ReactElement {
  const projections = useProjectionsPageQuery({ runId: 'run-1', cursor: 'c1', limit: 12 });
  const roots = rootsOf(useQueryClient());
  const label = projections.isSuccess
    ? `page:${projections.data.items.length}`
    : projections.status;
  return (
    <p>
      {label}|{roots}
    </p>
  );
}

function CandlesProbe(): ReactElement {
  const candles = useMarketCandlesQuery({ symbol: 'LINKUSDT', timeframe: '1h', from: 1, to: 9 });
  const roots = rootsOf(useQueryClient());
  return (
    <p>
      {candles.isSuccess ? `velas:${candles.data.length}` : candles.status}|{roots}
    </p>
  );
}

function route(path: string, body: unknown): readonly FakeRoute[] {
  return [{ method: 'GET', path, respond: (): Response => dataResponse(body) }];
}

describe('strategy layers schema', () => {
  test('accepts the server shape, with or without lines', () => {
    expect(strategyLayersSchema.safeParse(buildLayersResponse()).success).toBe(true);
    const bare = buildLayersResponse({ lines: [], thresholds: [] });
    expect(strategyLayersSchema.safeParse(bare).success).toBe(true);
  });

  test('rejects another version, a number where text is expected and a column of another length', () => {
    expect(
      strategyLayersSchema.safeParse(buildLayersResponse({ version: 'layers-2' })).success,
    ).toBe(false);
    expect(strategyLayersSchema.safeParse(buildLayersResponse({ score: [0, 1, 2] })).success).toBe(
      false,
    );
    expect(strategyLayersSchema.safeParse(buildLayersResponse({ atr: ['1', '2'] })).success).toBe(
      false,
    );
    const shortLine = [{ key: 'k', ruleId: 'r', role: 'ema_fast', label: 'L', values: ['1'] }];
    expect(strategyLayersSchema.safeParse(buildLayersResponse({ lines: shortLine })).success).toBe(
      false,
    );
  });

  test('rejects an unknown line role and a non-decimal threshold', () => {
    const badRole = [{ key: 'k', ruleId: 'r', role: 'rsi', label: 'L', values: ['1', '1', '1'] }];
    expect(strategyLayersSchema.safeParse(buildLayersResponse({ lines: badRole })).success).toBe(
      false,
    );
    const badThreshold = [{ from: 1, to: 2, buy: '2e0', sell: '-2' }];
    expect(
      strategyLayersSchema.safeParse(buildLayersResponse({ thresholds: badThreshold })).success,
    ).toBe(false);
  });
});

describe('projections schema', () => {
  test('accepts the available and each unavailable current', () => {
    expect(projectionsSchema.safeParse(buildProjectionsResponse()).success).toBe(true);
    const reasons = ['not_running', 'stalled', 'waiting_for_data', 'read_failed'];
    for (const reason of [...reasons, 'no_candle', 'warming_up', 'neutral']) {
      const current = { status: 'unavailable', reason, message: 'Sem previsão.' };
      expect(projectionsSchema.safeParse(buildProjectionsResponse({ current })).success).toBe(true);
    }
  });

  test('rejects an unknown version, verdict, result or reason', () => {
    const parse = (overrides: Record<string, unknown>): boolean =>
      projectionsSchema.safeParse(buildProjectionsResponse(overrides)).success;
    expect(parse({ version: 'projection-2' })).toBe(false);
    expect(parse({ summary: buildProjectionsSummary({ verdict: 'great' }) })).toBe(false);
    expect(parse({ items: [buildProjectionItem({ result: 'win' })] })).toBe(false);
    expect(parse({ current: { status: 'unavailable', reason: 'stopped', message: 'x' } })).toBe(
      false,
    );
  });

  test('a page by cursor carries only the predictions: no current and no summary', () => {
    const { current, summary, ...page } = buildProjectionsResponse();
    expect(current).toBeDefined();
    expect(summary).toBeDefined();
    expect(projectionsPageSchema.safeParse(page).success).toBe(true);
    expect(projectionsSchema.safeParse(page).success).toBe(false);
  });

  test('rejects a percentage that is not decimal text', () => {
    const bad = buildProjectionsResponse({ summary: buildProjectionsSummary({ hitRate: 0.4942 }) });
    expect(projectionsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('market candle schema and stream candle message', () => {
  test('a candle keeps price and volume as exact text', () => {
    expect(marketCandleSchema.safeParse(buildMarketCandle(0)).success).toBe(true);
    expect(marketCandleSchema.safeParse(buildMarketCandle(0, { close: 12.9 })).success).toBe(false);
    expect(marketCandleSchema.safeParse(buildMarketCandle(0, { volume: '1e3' })).success).toBe(
      false,
    );
  });

  test('the stream accepts a forming and a closed candle and drops a malformed one', () => {
    const forming = parseServerMessage(JSON.stringify(buildStreamCandle()));
    expect(forming?.type === 'candle' && forming.closed).toBe(false);
    const closed = parseServerMessage(JSON.stringify(buildStreamCandle({ closed: true })));
    expect(closed?.type === 'candle' && closed.closed).toBe(true);
    const badClose = buildStreamCandle({ close: 'NaN' });
    expect(parseServerMessage(JSON.stringify(badClose))).toBeUndefined();
    const withoutOpenTime = { ...buildStreamCandle(), openTime: undefined };
    expect(parseServerMessage(JSON.stringify(withoutOpenTime))).toBeUndefined();
  });
});

describe('candle chart queries', () => {
  test('the layers query sends the range and its key starts with "runs"', async () => {
    const routes = route('/v1/runs/run-1/strategy-layers', buildLayersResponse());
    const { fake } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes,
      probe: <LayersProbe />,
    });
    expect(await screen.findByText(/velas:3/)).toBeDefined();
    const query = fake.callsTo('GET', '/v1/runs/run-1/strategy-layers')[0]?.query;
    expect([query?.get('from'), query?.get('to')]).toEqual(['10', '20']);
    expect(screen.getByText(/\|runs$/)).toBeDefined();
  });

  test('an invalid layers response renders nothing from the data', async () => {
    const bad = buildLayersResponse({ score: ['0'] });
    const routes = route('/v1/runs/run-1/strategy-layers', bad);
    renderApp({ path: '/', isAuthenticated: true, routes, probe: <LayersProbe /> });
    expect(await screen.findByText(/^error/)).toBeDefined();
    expect(screen.queryByText(/velas:/)).toBeNull();
  });

  test('the projections query sends the cursor and limit under "runs"', async () => {
    const routes = route('/v1/runs/run-1/projections', buildProjectionsResponse());
    const { fake } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes,
      probe: <ProjectionsProbe />,
    });
    expect(await screen.findByText(/^page:\d+\|runs$/)).toBeDefined();
    const query = fake.callsTo('GET', '/v1/runs/run-1/projections')[0]?.query;
    expect([query?.get('cursor'), query?.get('limit')]).toEqual(['c1', '12']);
  });

  test('an invalid projections response ends in error with nothing rendered', async () => {
    const bad = buildProjectionsResponse({ items: [buildProjectionItem({ result: 'win' })] });
    const routes = route('/v1/runs/run-1/projections', bad);
    renderApp({ path: '/', isAuthenticated: true, routes, probe: <ProjectionsProbe /> });
    expect(await screen.findByText(/^error/)).toBeDefined();
    expect(screen.queryByText(/^page:/)).toBeNull();
  });

  test('the public candles query sends symbol, timeframe and range and its key starts with "markets"', async () => {
    const routes = route('/v1/markets/candles', [buildMarketCandle(0), buildMarketCandle(1)]);
    const { fake } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes,
      probe: <CandlesProbe />,
    });
    expect(await screen.findByText(/velas:2/)).toBeDefined();
    const query = fake.callsTo('GET', '/v1/markets/candles')[0]?.query;
    expect([
      query?.get('symbol'),
      query?.get('timeframe'),
      query?.get('from'),
      query?.get('to'),
    ]).toEqual(['LINKUSDT', '1h', '1', '9']);
    expect(screen.getByText(/\|markets$/)).toBeDefined();
  });

  test('an invalid candle row makes the whole page fail', async () => {
    const routes = route('/v1/markets/candles', [
      buildMarketCandle(0),
      buildMarketCandle(1, { high: 'abc', openTime: FIRST_CANDLE_TIME }),
    ]);
    renderApp({ path: '/', isAuthenticated: true, routes, probe: <CandlesProbe /> });
    expect(await screen.findByText(/^error/)).toBeDefined();
    expect(screen.queryByText(/velas:/)).toBeNull();
  });
});
