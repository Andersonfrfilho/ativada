// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createKlineStream,
  createMarketDataClient,
  MarketDataInvalidRequestError,
  MarketDataResponseError,
  MarketDataTimeoutError,
  SUPPORTED_MARKET_EXCHANGES,
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
  type FetchImplementation,
  type Timeframe,
} from '../packages/market-data/src/index.js';
import {
  buildSyntheticSeries,
  createFakeClock,
  createScriptedFetch,
  createSeriesFetch,
} from './fixtures/fake-binance.fixture.js';

const BASE_URL = 'https://market-data.test';
const SYMBOL = 'BTCUSDT';
const FAR_FUTURE_MILLISECONDS = 4_000_000_000_000;
const FIRST_OPEN_TIME = 1_735_689_600_000;
const ONE_HOUR = TIMEFRAME_DURATION_MILLISECONDS[TIMEFRAME.ONE_HOUR];
const INHERITED_NAMES = ['toString', 'constructor', '__proto__', 'hasOwnProperty'];

function asTimeframe(name: string): Timeframe {
  return name as Timeframe;
}

describe('timeframe names are checked as own keys, not through the prototype chain', () => {
  test.each(INHERITED_NAMES)(
    'REST request with timeframe %s is invalid and sends nothing',
    async (name) => {
      const { fetchImplementation, calls } = createScriptedFetch([{ status: 200, body: [] }]);
      const client = createMarketDataClient({ baseUrl: BASE_URL, fetchImplementation });
      const failure = await client
        .fetchKlines({ symbol: SYMBOL, timeframe: asTimeframe(name) })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(MarketDataInvalidRequestError);
      expect(calls).toHaveLength(0);
    },
  );

  test.each(INHERITED_NAMES)('stream subscription with timeframe %s is invalid', (name) => {
    expect(() =>
      createKlineStream({
        symbols: [SYMBOL],
        timeframes: [asTimeframe(name)],
        onCandle: () => undefined,
      }),
    ).toThrow(MarketDataInvalidRequestError);
  });
});

describe('reading the response body', () => {
  function bodyThatFails(error: Error): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.reject(error),
    } as unknown as Response;
  }

  function buildClient(fetchImplementation: FetchImplementation): {
    readonly client: ReturnType<typeof createMarketDataClient>;
    readonly sleeps: number[];
  } {
    const clock = createFakeClock(FIRST_OPEN_TIME);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: clock.now,
      sleep: clock.sleep,
      maxAttempts: 3,
      backoffBaseMilliseconds: 100,
    });
    return { client, sleeps: clock.sleeps };
  }

  test('a timeout while reading the body is a retryable transport error, not an invalid JSON', async () => {
    let calls = 0;
    const { client, sleeps } = buildClient(() => {
      calls += 1;
      return Promise.resolve(bodyThatFails(new DOMException('timed out', 'TimeoutError')));
    });
    const failure = await client
      .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataTimeoutError);
    expect(calls).toBe(3);
    expect(sleeps).toStrictEqual([100, 200]);
  });

  test('the retry after a body timeout can succeed', async () => {
    const good = new Response(JSON.stringify([]), { status: 200 });
    const responses = [bodyThatFails(new DOMException('timed out', 'TimeoutError')), good];
    const { client } = buildClient(() => Promise.resolve(responses.shift() ?? good));
    expect(
      await client.fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR }),
    ).toStrictEqual([]);
  });

  test('a body that is really not JSON stays a non retryable response error', async () => {
    let calls = 0;
    const { client } = buildClient(() => {
      calls += 1;
      return Promise.resolve(new Response('<html>', { status: 200 }));
    });
    const failure = await client
      .fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect(calls).toBe(1);
  });
});

describe('fetchKlinesRange memory', () => {
  const series = buildSyntheticSeries({
    firstOpenTime: FIRST_OPEN_TIME,
    durationMilliseconds: ONE_HOUR,
    count: 2_500,
  });
  const params = {
    symbol: SYMBOL,
    timeframe: TIMEFRAME.ONE_HOUR,
    from: FIRST_OPEN_TIME,
    to: FIRST_OPEN_TIME + 2_499 * ONE_HOUR,
  };

  test('with onPage the pages go to the consumer and nothing is accumulated', async () => {
    const { fetchImplementation } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    let delivered = 0;
    const returned = await client.fetchKlinesRange({
      ...params,
      onPage: (page) => {
        delivered += page.length;
        return Promise.resolve();
      },
    });
    expect(delivered).toBe(2_500);
    expect(returned).toHaveLength(0);
  });

  test('without onPage the whole range is still returned', async () => {
    const { fetchImplementation } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
    });
    expect(await client.fetchKlinesRange(params)).toHaveLength(2_500);
  });
});

describe('supported exchanges', () => {
  test('binance is the only one', () => {
    expect([...SUPPORTED_MARKET_EXCHANGES]).toStrictEqual(['binance']);
  });
});
