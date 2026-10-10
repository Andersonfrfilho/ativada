// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createMarketDataClient,
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
} from '../packages/market-data/src/index.js';
import {
  buildSyntheticSeries,
  createFakeClock,
  createSeriesFetch,
} from './fixtures/fake-binance.fixture.js';

const BASE_URL = 'https://market-data.test';
const SYMBOL = 'BTCUSDT';
const FAR_FUTURE_MILLISECONDS = 4_000_000_000_000;
const FIRST_OPEN_TIME = 1_735_689_600_000;
const ONE_HOUR = TIMEFRAME_DURATION_MILLISECONDS[TIMEFRAME.ONE_HOUR];

describe('market-data klines range pagination contract', () => {
  test('paginates 2500 synthetic candles in order, without gaps or duplicates', async () => {
    const series = buildSyntheticSeries({
      firstOpenTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      count: 2_500,
    });
    const { fetchImplementation, calls } = createSeriesFetch(series);
    const clock = createFakeClock(FAR_FUTURE_MILLISECONDS);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: clock.now,
      sleep: clock.sleep,
    });
    const to = FIRST_OPEN_TIME + 2_499 * ONE_HOUR;
    const candles = await client.fetchKlinesRange({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      from: FIRST_OPEN_TIME,
      to,
    });
    expect(candles).toHaveLength(2_500);
    const openTimes = candles.map((candle) => candle.openTime);
    expect(openTimes).toEqual(series.map((row) => Number(row[0])));
    expect(new Set(openTimes).size).toBe(2_500);
    expect(calls.map((call) => call.url.searchParams.get('startTime'))).toEqual([
      String(FIRST_OPEN_TIME),
      String(FIRST_OPEN_TIME + 1_000 * ONE_HOUR),
      String(FIRST_OPEN_TIME + 2_000 * ONE_HOUR),
    ]);
    expect(calls.every((call) => call.url.searchParams.get('limit') === '1000')).toBe(true);
  });

  test('range stops when a page is exactly full and the next one is empty', async () => {
    const series = buildSyntheticSeries({
      firstOpenTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      count: 1_000,
    });
    const { fetchImplementation, calls } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const candles = await client.fetchKlinesRange({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      from: FIRST_OPEN_TIME,
      to: FIRST_OPEN_TIME + 5_000 * ONE_HOUR,
    });
    expect(candles).toHaveLength(1_000);
    expect(calls).toHaveLength(2);
  });

  test('fetchKlinesRange hands each page to onPage before asking for the next one', async () => {
    const series = buildSyntheticSeries({
      firstOpenTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      count: 2_500,
    });
    const { fetchImplementation, calls } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const callsSeenByPage: number[] = [];
    const pageSizes: number[] = [];
    await client.fetchKlinesRange({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      from: FIRST_OPEN_TIME,
      to: FIRST_OPEN_TIME + 2_499 * ONE_HOUR,
      onPage: (page) => {
        callsSeenByPage.push(calls.length);
        pageSizes.push(page.length);
        return Promise.resolve();
      },
    });
    expect(pageSizes).toStrictEqual([1_000, 1_000, 500]);
    expect(callsSeenByPage).toStrictEqual([1, 2, 3]);
  });

  test('a failing onPage stops the range before the next request', async () => {
    const series = buildSyntheticSeries({
      firstOpenTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      count: 2_500,
    });
    const { fetchImplementation, calls } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    const attempt = client.fetchKlinesRange({
      symbol: SYMBOL,
      timeframe: TIMEFRAME.ONE_HOUR,
      from: FIRST_OPEN_TIME,
      to: FIRST_OPEN_TIME + 2_499 * ONE_HOUR,
      onPage: () => Promise.reject(new Error('disk full')),
    });
    const outcome = await attempt.catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe('disk full');
    expect(calls).toHaveLength(1);
  });
});
