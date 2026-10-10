// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFearGreedClient,
  MarketDataHttpError,
  MarketDataInvalidRequestError,
  MarketDataNetworkError,
  MarketDataResponseError,
  MarketDataSourceError,
  MarketDataTimeoutError,
  type FearGreedClient,
  type FetchImplementation,
} from '../packages/market-data/src/index.js';
import { createFakeClock, type FakeClock } from './fixtures/fake-binance.fixture.js';
import {
  buildFearGreedBody,
  buildFearGreedItem,
  createFearGreedFetch,
  FEAR_GREED_BASE_URL,
  loadRealFearGreedResponse,
  type FearGreedReply,
  type RecordedFearGreedCall,
} from './fixtures/fear-greed.fixture.js';

const SECRET_MARKER = 'segredo-que-nao-pode-vazar';

function buildClient(
  script: readonly FearGreedReply[],
  overrides: Record<string, number> = {},
): { client: FearGreedClient; clock: FakeClock; calls: RecordedFearGreedCall[] } {
  const clock = createFakeClock(0);
  const scripted = createFearGreedFetch(script);
  const client = createFearGreedClient({
    baseUrl: FEAR_GREED_BASE_URL,
    fetchImplementation: scripted.fetchImplementation,
    sleep: clock.sleep,
    maxAttempts: 3,
    backoffBaseMilliseconds: 100,
    backoffMaxMilliseconds: 150,
    ...overrides,
  });
  return { client, clock, calls: scripted.calls };
}

async function failureOf(reply: FearGreedReply): Promise<unknown> {
  const { client } = buildClient([reply], { maxAttempts: 1 });
  return client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error);
}

function bodyWith(item: Record<string, unknown>): FearGreedReply {
  return { status: 200, body: buildFearGreedBody([item]) };
}

describe('fear-greed client: the real alternative.me response', () => {
  test('parses the recorded fixture into five UTC dates with exact values, oldest first', async () => {
    const { client } = buildClient([{ status: 200, body: await loadRealFearGreedResponse() }]);
    const points = await client.fetchFearGreed({ limit: 5 });
    expect(points).toStrictEqual([
      { date: '2026-10-06', value: 73, classification: 'Greed' },
      { date: '2026-10-07', value: 71, classification: 'Greed' },
      { date: '2026-10-08', value: 64, classification: 'Greed' },
      { date: '2026-10-09', value: 59, classification: 'Greed' },
      { date: '2026-10-10', value: 64, classification: 'Greed' },
    ]);
  });

  test('time_until_update is optional: the item without it parses the same', async () => {
    const item = buildFearGreedItem({ value: '50', timestamp: '1791504000' });
    const withField = { ...item, time_until_update: '123' };
    const first = await buildClient([bodyWith(item)]).client.fetchFearGreed({ limit: 1 });
    const second = await buildClient([bodyWith(withField)]).client.fetchFearGreed({ limit: 1 });
    expect(first).toStrictEqual(second);
  });

  test('the timestamp is seconds: a mid-day second still lands on its UTC date', async () => {
    const item = buildFearGreedItem({ value: '10', timestamp: String(1791504000 + 86_399) });
    const [point] = await buildClient([bodyWith(item)]).client.fetchFearGreed({ limit: 1 });
    expect(point?.date).toBe('2026-10-09');
  });

  test('two items on the same date keep the most recent timestamp', async () => {
    const morning = buildFearGreedItem({ value: '10', timestamp: '1791504000' });
    const evening = buildFearGreedItem({ value: '20', timestamp: String(1791504000 + 43_200) });
    const body = buildFearGreedBody([evening, morning]);
    const points = await buildClient([{ status: 200, body }]).client.fetchFearGreed({ limit: 2 });
    expect(points).toStrictEqual([{ date: '2026-10-09', value: 20, classification: 'Neutral' }]);
  });
});

describe('fear-greed client: third-party responses are never trusted', () => {
  test.each([
    ['value above 100', buildFearGreedItem({ value: '101', timestamp: '1791504000' })],
    ['value below 0', buildFearGreedItem({ value: '-1', timestamp: '1791504000' })],
    ['non numeric value', buildFearGreedItem({ value: SECRET_MARKER, timestamp: '1791504000' })],
    ['fractional value', buildFearGreedItem({ value: '50.5', timestamp: '1791504000' })],
    [
      'numeric (not string) value',
      { ...buildFearGreedItem({ value: '5', timestamp: '1791504000' }), value: 5 },
    ],
    ['non numeric timestamp', buildFearGreedItem({ value: '50', timestamp: SECRET_MARKER })],
    ['absurd timestamp', buildFearGreedItem({ value: '50', timestamp: '99999999999999999' })],
    ['missing classification', { value: '50', timestamp: '1791504000' }],
  ])('%s -> typed response error that does not echo the body', async (_name, item) => {
    const failure = await failureOf(bodyWith(item));
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test('metadata.error filled -> typed source error without echoing it', async () => {
    const item = buildFearGreedItem({ value: '50', timestamp: '1791504000' });
    const body = buildFearGreedBody([item], SECRET_MARKER);
    const failure = await failureOf({ status: 200, body });
    expect(failure).toBeInstanceOf(MarketDataSourceError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test('a body that is not JSON -> typed response error without echo', async () => {
    const failure = await failureOf({ status: 200, rawBody: `<html>${SECRET_MARKER}</html>` });
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test.each([[{}], [[]], [{ data: 'x', metadata: { error: null } }]])(
    'envelope %j -> typed response error',
    async (body) => {
      expect(await failureOf({ status: 200, body })).toBeInstanceOf(MarketDataResponseError);
    },
  );

  test('limit must be a non negative integer', async () => {
    const { client } = buildClient([{ status: 200, body: buildFearGreedBody([]) }]);
    for (const limit of [-1, 1.5, Number.NaN])
      expect(
        await client.fetchFearGreed({ limit }).catch((error: unknown) => error),
      ).toBeInstanceOf(MarketDataInvalidRequestError);
  });
});

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
