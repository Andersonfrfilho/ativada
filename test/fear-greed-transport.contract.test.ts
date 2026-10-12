// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFearGreedClient,
  MarketDataHttpError,
  MarketDataNetworkError,
  MarketDataTimeoutError,
  type FetchImplementation,
} from '../packages/market-data-crypto/src/index.js';
import { createFakeClock } from './fixtures/fake-binance.fixture.js';
import { buildClient, failureOf } from './fixtures/fear-greed-client.fixture.js';
import { buildFearGreedBody, FEAR_GREED_BASE_URL } from './fixtures/fear-greed.fixture.js';

describe('fear-greed client: transport', () => {
  test('requests the configured limit (0 means the whole history) in JSON format', async () => {
    const { client, calls } = buildClient([{ status: 200, body: buildFearGreedBody([]) }]);
    await client.fetchFearGreed({ limit: 0 });
    await client.fetchFearGreed({ limit: 14 });
    expect(calls.map((call) => call.url.searchParams.get('limit'))).toStrictEqual(['0', '14']);
    expect(calls.every((call) => call.url.searchParams.get('format') === 'json')).toBe(true);
    expect(calls.every((call) => call.url.pathname === '/fng/')).toBe(true);
  });

  test('5xx is retried with a capped exponential backoff and stops at the attempt ceiling', async () => {
    const { client, clock, calls } = buildClient([{ status: 503, body: {} }]);
    const failure = await client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataHttpError);
    expect(calls).toHaveLength(3);
    expect(clock.sleeps).toStrictEqual([100, 150]);
  });

  test('a 5xx followed by success recovers', async () => {
    const ok = { status: 200, body: buildFearGreedBody([]) };
    const { client, calls } = buildClient([{ status: 502, body: {} }, ok]);
    expect(await client.fetchFearGreed({ limit: 5 })).toStrictEqual([]);
    expect(calls).toHaveLength(2);
  });

  test('a 4xx is not retried', async () => {
    const { client, calls } = buildClient([{ status: 400, body: {} }]);
    expect(
      await client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataHttpError);
    expect(calls).toHaveLength(1);
  });

  test('a network error is retried and then typed', async () => {
    const { client, calls } = buildClient([{ error: new TypeError('fetch failed') }]);
    expect(
      await client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataNetworkError);
    expect(calls).toHaveLength(3);
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
    const client = createFearGreedClient({
      baseUrl: FEAR_GREED_BASE_URL,
      fetchImplementation: hangingFetch,
      sleep: createFakeClock(0).sleep,
      maxAttempts: 1,
      requestTimeoutMilliseconds: 20,
    });
    expect(
      await client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error),
    ).toBeInstanceOf(MarketDataTimeoutError);
  });

  test('errors name alternative.me, never Binance', async () => {
    const failure = await failureOf({ status: 503, body: {} });
    expect((failure as Error).message).not.toContain('Binance');
  });
});
