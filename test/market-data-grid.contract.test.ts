// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createMarketDataClient,
  MarketDataResponseError,
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
} from '../packages/market-data-crypto/src/index.js';
import { buildRawKline, createScriptedFetch } from './fixtures/fake-binance.fixture.js';

const BASE_URL = 'https://market-data.test';
const SYMBOL = 'BTCUSDT';
const FAR_FUTURE_MILLISECONDS = 4_000_000_000_000;
const FIRST_OPEN_TIME = 1_735_689_600_000;
const ONE_HOUR = TIMEFRAME_DURATION_MILLISECONDS[TIMEFRAME.ONE_HOUR];
const BODY_ECHO_MARKER = 'SEGREDO-NAO-PODE-VAZAR';

function rowAt(hours: number): unknown[] {
  return buildRawKline({
    openTime: FIRST_OPEN_TIME + hours * ONE_HOUR,
    durationMilliseconds: ONE_HOUR,
    index: hours,
  });
}

function buildClient(rows: readonly unknown[]): ReturnType<typeof createMarketDataClient> {
  const { fetchImplementation } = createScriptedFetch([{ status: 200, body: rows }]);
  return createMarketDataClient({
    baseUrl: BASE_URL,
    fetchImplementation,
    now: () => FAR_FUTURE_MILLISECONDS,
  });
}

async function captureRange(rows: readonly unknown[], pages: unknown[][] = []): Promise<unknown> {
  return buildClient(rows)
    .fetchKlinesRange({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      from: FIRST_OPEN_TIME,
      to: FIRST_OPEN_TIME + 4 * ONE_HOUR,
      onPage: (page) => {
        pages.push([...page]);
        return Promise.resolve();
      },
    })
    .catch((error: unknown) => error);
}

describe('klines response: a column added by the exchange does not break the parse', () => {
  test('extra trailing columns are ignored', async () => {
    const withNewColumns = [...rowAt(0), 'nova-coluna', 42, { aninhado: true }];
    const candles = await buildClient([withNewColumns, rowAt(1)]).fetchKlines({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
    });
    expect(candles.map((candle) => candle.openTime)).toStrictEqual([
      FIRST_OPEN_TIME,
      FIRST_OPEN_TIME + ONE_HOUR,
    ]);
    expect(candles[0]).not.toHaveProperty('nova-coluna');
  });

  test('a row with fewer columns than the documented ones is still rejected', async () => {
    const shortRow = rowAt(0).slice(0, 11);
    const failure = await buildClient([shortRow])
      .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataResponseError);
  });
});

describe('klines response: it must sit on the timeframe grid and inside the request', () => {
  test.each([
    ['descending order', [rowAt(1), rowAt(0)]],
    ['a repeated row', [rowAt(0), rowAt(0)]],
    [
      'a closeTime one millisecond late',
      [[...rowAt(0).slice(0, 6), FIRST_OPEN_TIME + ONE_HOUR, ...rowAt(0).slice(7)]],
    ],
    [
      'a closeTime one millisecond early',
      [[...rowAt(0).slice(0, 6), FIRST_OPEN_TIME + ONE_HOUR - 2, ...rowAt(0).slice(7)]],
    ],
    ['a row before startTime', [rowAt(-1), rowAt(0)]],
    ['a row after endTime', [rowAt(0), rowAt(5)]],
  ])('%s -> MarketDataResponseError and nothing is handed to onPage', async (_name, rows) => {
    const pages: unknown[][] = [];
    expect(await captureRange(rows, pages)).toBeInstanceOf(MarketDataResponseError);
    expect(pages).toHaveLength(0);
  });

  test('a response that fits the grid and the window is handed over', async () => {
    const pages: unknown[][] = [];
    const outcome = await captureRange([rowAt(0), rowAt(1), rowAt(4)], pages);
    expect(outcome).not.toBeInstanceOf(Error);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(3);
  });

  test('the grid error names the problem but never echoes the body', async () => {
    const poisoned = [...rowAt(0).slice(0, 6), 1, ...rowAt(0).slice(7), BODY_ECHO_MARKER];
    const failure = await captureRange([poisoned]);
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect((failure as Error).message).not.toContain(BODY_ECHO_MARKER);
  });
});
