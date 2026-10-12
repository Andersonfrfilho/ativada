// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createMarketDataClient,
  MarketDataBannedError,
  MAXIMUM_RETRY_AFTER_SECONDS,
  type FetchImplementation,
  type MarketDataClient,
  MarketDataHttpError,
  MarketDataNetworkError,
  MarketDataRateLimitError,
  MarketDataTimeoutError,
  TIMEFRAME,
} from '../packages/market-data-crypto/src/index.js';
import {
  createFakeClock,
  createScriptedFetch,
  type FakeClock,
  type RecordedCall,
  type ScriptedResponse,
} from './fixtures/fake-binance.fixture.js';

const BASE_URL = 'https://market-data.test';
const REQUEST = { symbol: 'BTCUSDT', timeframe: TIMEFRAME.ONE_HOUR } as const;
const START_MILLISECONDS = 600_000 + 15_000;
const OK: ScriptedResponse = { status: 200, body: [] };

function buildClient(
  script: readonly ScriptedResponse[],
  overrides: Record<string, number> = {},
): { client: MarketDataClient; clock: FakeClock; calls: RecordedCall[] } {
  const clock = createFakeClock(START_MILLISECONDS);
  const scripted = createScriptedFetch(script);
  const client = createMarketDataClient({
    baseUrl: BASE_URL,
    fetchImplementation: scripted.fetchImplementation,
    now: clock.now,
    sleep: clock.sleep,
    maxAttempts: 3,
    backoffBaseMilliseconds: 100,
    backoffMaxMilliseconds: 1_000,
    ...overrides,
  });
  return { client, clock, calls: scripted.calls };
}

describe('market-data resilience contract', () => {
  test('429 with Retry-After: 2 waits 2000 ms and retries', async () => {
    const { client, clock, calls } = buildClient([
      { status: 429, headers: { 'retry-after': '2' } },
      OK,
    ]);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([2_000]);
    expect(calls).toHaveLength(2);
  });

  test('429 forever ends in MarketDataRateLimitError after the attempt ceiling', async () => {
    const { client, calls } = buildClient([{ status: 429, headers: { 'retry-after': '1' } }]);
    const failure = await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataRateLimitError);
    expect(calls).toHaveLength(3);
  });

  test('418 is fatal: typed error, one request, no sleep', async () => {
    const { client, clock, calls } = buildClient([
      { status: 418, headers: { 'retry-after': '120' } },
      OK,
    ]);
    const failure = await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataBannedError);
    expect((failure as MarketDataBannedError).retryAfterSeconds).toBe(120);
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  test('5xx backs off exponentially and stops at the attempt ceiling', async () => {
    const { client, clock, calls } = buildClient([{ status: 503 }]);
    const failure = await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataHttpError);
    expect((failure as MarketDataHttpError).status).toBe(503);
    expect(calls).toHaveLength(3);
    expect(clock.sleeps).toEqual([100, 200]);
  });

  test('backoff is capped by backoffMaxMilliseconds', async () => {
    const { client, clock } = buildClient([{ status: 500 }], {
      maxAttempts: 5,
      backoffMaxMilliseconds: 250,
    });
    await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(clock.sleeps).toEqual([100, 200, 250, 250]);
  });

  test('a 5xx followed by success returns the data', async () => {
    const { client, clock } = buildClient([{ status: 502 }, OK]);
    expect(await client.fetchKlines(REQUEST)).toEqual([]);
    expect(clock.sleeps).toEqual([100]);
  });

  test('a network error is retried and then typed', async () => {
    const { client, calls } = buildClient([{ error: new TypeError('fetch failed') }]);
    const failure = await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataNetworkError);
    expect(calls).toHaveLength(3);
  });

  test('a timeout becomes MarketDataTimeoutError', async () => {
    const { client } = buildClient([{ error: new DOMException('timed out', 'TimeoutError') }], {
      maxAttempts: 1,
    });
    expect(await client.fetchKlines(REQUEST).catch((error: unknown) => error)).toBeInstanceOf(
      MarketDataTimeoutError,
    );
  });

  test('a request that outlives requestTimeoutMilliseconds is aborted by its signal', async () => {
    const hangingFetch: FetchImplementation = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('timed out', 'TimeoutError')),
          { once: true },
        );
      });
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation: hangingFetch,
      now: () => START_MILLISECONDS,
      sleep: createFakeClock(START_MILLISECONDS).sleep,
      maxAttempts: 1,
      requestTimeoutMilliseconds: 20,
    });
    const failure = await client.fetchKlines(REQUEST).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataTimeoutError);
  });

  test('a 4xx other than 429 and 418 is not retried', async () => {
    const { client, calls } = buildClient([{ status: 400, body: { code: -1121 } }, OK]);
    expect(await client.fetchKlines(REQUEST).catch((error: unknown) => error)).toBeInstanceOf(
      MarketDataHttpError,
    );
    expect(calls).toHaveLength(1);
  });

  test('a used weight near the ceiling waits for the next minute window', async () => {
    const { client, clock, calls } = buildClient(
      [{ status: 200, body: [], headers: { 'x-mbx-used-weight-1m': '95' } }, OK],
      { weightCeiling: 100, weightSafetyMargin: 10 },
    );
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([]);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([45_000]);
    expect(calls).toHaveLength(2);
  });

  test('a used weight below the threshold does not wait', async () => {
    const { client, clock } = buildClient(
      [{ status: 200, body: [], headers: { 'x-mbx-used-weight-1m': '50' } }, OK],
      { weightCeiling: 100, weightSafetyMargin: 10 },
    );
    await client.fetchKlines(REQUEST);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([]);
  });

  test('Retry-After on a 429 is capped at 300 s', async () => {
    const { client, clock } = buildClient([
      { status: 429, headers: { 'retry-after': '3600' } },
      OK,
    ]);
    await client.fetchKlines(REQUEST);
    expect(MAXIMUM_RETRY_AFTER_SECONDS).toBe(300);
    expect(clock.sleeps).toEqual([300_000]);
  });

  test('a used weight exactly at the threshold waits (the comparison is strict on the safe side)', async () => {
    const { client, clock } = buildClient(
      [{ status: 200, body: [], headers: { 'x-mbx-used-weight-1m': '90' } }, OK],
      { weightCeiling: 100, weightSafetyMargin: 10 },
    );
    await client.fetchKlines(REQUEST);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([45_000]);
  });

  test('a used weight one below the threshold does not wait', async () => {
    const { client, clock } = buildClient(
      [{ status: 200, body: [], headers: { 'x-mbx-used-weight-1m': '89' } }, OK],
      { weightCeiling: 100, weightSafetyMargin: 10 },
    );
    await client.fetchKlines(REQUEST);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([]);
  });

  test('a weight read in an earlier minute window does not block the next window', async () => {
    const { client, clock } = buildClient(
      [{ status: 200, body: [], headers: { 'x-mbx-used-weight-1m': '95' } }, OK],
      { weightCeiling: 100, weightSafetyMargin: 10 },
    );
    await client.fetchKlines(REQUEST);
    clock.advance(60_000);
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([]);
  });

  test.each([
    ['429', { status: 429, headers: { 'retry-after': '1', 'x-mbx-used-weight-1m': '95' } }],
    ['503', { status: 503, headers: { 'x-mbx-used-weight-1m': '95' } }],
  ] as const)('the weight header of a %s response is recorded too', async (_name, failure) => {
    const { client, clock } = buildClient([failure, OK], {
      weightCeiling: 100,
      weightSafetyMargin: 10,
      backoffBaseMilliseconds: 1_000,
    });
    await client.fetchKlines(REQUEST);
    expect(clock.sleeps).toEqual([1_000, 44_000]);
  });
});
