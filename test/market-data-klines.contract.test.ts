// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createMarketDataClient,
  MarketDataInvalidRequestError,
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

async function readFixture(fileName: string): Promise<unknown> {
  return Bun.file(new URL(`./fixtures/binance/${fileName}`, import.meta.url)).json();
}

describe('market-data klines contract', () => {
  test('parses the recorded BTCUSDT 1h response into exact string candles', async () => {
    const body = await readFixture('klines-btcusdt-1h-5.json');
    const { fetchImplementation, calls } = createScriptedFetch([{ status: 200, body }]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const candles = await client.fetchKlines({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      startTime: FIRST_OPEN_TIME,
      limit: 5,
    });
    expect(candles).toHaveLength(5);
    expect(candles[0]).toEqual({
      symbol: SYMBOL,
      timeframe: '1h',
      openTime: 1_735_689_600_000,
      closeTime: 1_735_693_199_999,
      open: '93576.00000000',
      high: '94509.42000000',
      low: '93489.03000000',
      close: '94401.14000000',
      volume: '755.99010000',
      tradeCount: 93_525,
    });
    expect(candles[4]?.close).toBe('93553.91000000');
    const call = calls[0];
    expect(call?.url.origin).toBe(BASE_URL);
    expect(call?.url.pathname).toBe('/api/v3/klines');
    expect(call?.url.searchParams.get('symbol')).toBe(SYMBOL);
    expect(call?.url.searchParams.get('interval')).toBe('1h');
    expect(call?.url.searchParams.get('limit')).toBe('5');
    expect(call?.signal).toBeInstanceOf(AbortSignal);
  });

  test('parses the recorded ETHUSDT 4h response', async () => {
    const body = await readFixture('klines-ethusdt-4h-3.json');
    const { fetchImplementation } = createScriptedFetch([{ status: 200, body }]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const candles = await client.fetchKlines({
      symbol: 'ETHUSDT',
      timeframe: TIMEFRAME.FOUR_HOURS,
    });
    expect(candles.map((candle) => candle.open)).toEqual([
      '3337.78000000',
      '3355.20000000',
      '3347.11000000',
    ]);
    expect(candles[2]?.tradeCount).toBe(210_861);
  });

  test.each([
    ['a short tuple', [[1, '1', '1', '1', '1', '1', 2]]],
    [
      'a numeric price instead of a string',
      [[1, 1.5, '1', '1', '1', '1', 2, '1', 1, '1', '1', '0']],
    ],
    ['a non numeric string price', [[1, 'abc', '1', '1', '1', '1', 2, '1', 1, '1', '1', '0']]],
    ['a non array body', { code: -1121, msg: 'Invalid symbol.' }],
  ])('rejects %s with MarketDataResponseError', async (_label, body) => {
    const { fetchImplementation } = createScriptedFetch([{ status: 200, body }]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    expect(
      await client
        .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR })
        .catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataResponseError);
  });

  test('the response error message never echoes the body', async () => {
    const body = [
      [1, '1', '1', '1', '1', '1', 2, '1', 1, '1', '1', BODY_ECHO_MARKER, BODY_ECHO_MARKER],
    ];
    const { fetchImplementation } = createScriptedFetch([{ status: 200, body }]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const failure = await client
      .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect(String((failure as Error).message)).not.toContain(BODY_ECHO_MARKER);
  });

  test('discards a candle whose closeTime is not before now', async () => {
    const closed = buildRawKline({
      openTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      index: 0,
    });
    const justClosed = buildRawKline({
      openTime: FIRST_OPEN_TIME + ONE_HOUR,
      durationMilliseconds: ONE_HOUR,
      index: 1,
    });
    const open = buildRawKline({
      openTime: FIRST_OPEN_TIME + 2 * ONE_HOUR,
      durationMilliseconds: ONE_HOUR,
      index: 2,
    });
    const { fetchImplementation } = createScriptedFetch([
      { status: 200, body: [closed, justClosed, open] },
    ]);
    const closeTimeOfJustClosed = FIRST_OPEN_TIME + 2 * ONE_HOUR - 1;
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => closeTimeOfJustClosed + 1,
    });
    const candles = await client.fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR });
    expect(candles.map((candle) => candle.openTime)).toEqual([
      FIRST_OPEN_TIME,
      FIRST_OPEN_TIME + ONE_HOUR,
    ]);
    const clientAtBoundary = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => closeTimeOfJustClosed,
    });
    const boundaryCandles = await clientAtBoundary.fetchKlines({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
    });
    expect(boundaryCandles.map((candle) => candle.openTime)).toEqual([FIRST_OPEN_TIME]);
  });

  test('rejects an invalid limit and an invalid symbol before any request', async () => {
    const { fetchImplementation, calls } = createScriptedFetch([{ status: 200, body: [] }]);
    const client = createMarketDataClient({ baseUrl: BASE_URL, fetchImplementation });
    expect(
      await client
        .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR, limit: 1_001 })
        .catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataInvalidRequestError);
    expect(
      await client
        .fetchKlines({ symbol: 'btc&x=1', timeframe: TIMEFRAME.ONE_HOUR })
        .catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataInvalidRequestError);
    expect(calls).toHaveLength(0);
  });
});
