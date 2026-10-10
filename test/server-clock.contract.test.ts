// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createMarketDataClient,
  createServerClock,
  type FetchImplementation,
  type ServerClockWarning,
} from '../packages/market-data/src/index.js';
import { startFakeBinanceStreamServer } from '../packages/market-data/test-support/fake-binance-stream-server.js';
import { buildRawKline } from './fixtures/fake-binance.fixture.js';
import { createManualClock } from './fixtures/wait-for.fixture.js';

const BASE_URL = 'https://market-data.test';
const LOCAL_START = 1_000_000;
const REFRESH_INTERVAL = 600_000;
const HOUR = 3_600_000;

type Reply = () => Response | Promise<Response>;

type TimeScript = {
  readonly fetchImplementation: FetchImplementation;
  readonly paths: string[];
};

function scriptServerTime(replies: readonly Reply[]): TimeScript {
  const paths: string[] = [];
  const fetchImplementation: FetchImplementation = (url) => {
    paths.push(new URL(url).pathname);
    const reply = replies[Math.min(paths.length, replies.length) - 1];
    if (reply === undefined) return Promise.reject(new Error('empty script'));
    return Promise.resolve(reply());
  };
  return { fetchImplementation, paths };
}

function replyWithServerTime(serverTime: number): Reply {
  return (): Response => Response.json({ serverTime });
}

function replyWithStatus(status: number): Reply {
  return (): Response => new Response('{}', { status });
}

function replyWithBody(body: string): Reply {
  return (): Response => new Response(body);
}

function buildClock(params: {
  readonly script: TimeScript;
  readonly warnings?: ServerClockWarning[];
}): {
  readonly serverClock: ReturnType<typeof createServerClock>;
  readonly local: ReturnType<typeof createManualClock>;
} {
  const local = createManualClock(LOCAL_START);
  const serverClock = createServerClock({
    baseUrl: BASE_URL,
    fetchImplementation: params.script.fetchImplementation,
    now: local.now,
    refreshIntervalMilliseconds: REFRESH_INTERVAL,
    onWarning: (warning) => void params.warnings?.push(warning),
  });
  return { serverClock, local };
}

describe('server clock: the offset between the Binance clock and the local one', () => {
  test('reads GET /api/v3/time and applies serverTime minus localTime to now()', async () => {
    const script = scriptServerTime([replyWithServerTime(LOCAL_START + 7_000)]);
    const { serverClock, local } = buildClock({ script });
    await serverClock.refresh();
    expect(script.paths).toStrictEqual(['/api/v3/time']);
    expect(serverClock.now()).toBe(LOCAL_START + 7_000);
    local.advance(2_500);
    expect(serverClock.now()).toBe(LOCAL_START + 2_500 + 7_000);
  });

  test('without any reading it is the local clock', () => {
    const { serverClock } = buildClock({ script: scriptServerTime([replyWithServerTime(0)]) });
    expect(serverClock.now()).toBe(LOCAL_START);
  });

  test('the offset is measured at the middle of the round trip', async () => {
    const local = createManualClock(LOCAL_START);
    const serverClock = createServerClock({
      baseUrl: BASE_URL,
      fetchImplementation: () => {
        local.advance(200);
        return Promise.resolve(Response.json({ serverTime: LOCAL_START + 5_100 }));
      },
      now: local.now,
      refreshIntervalMilliseconds: REFRESH_INTERVAL,
    });
    await serverClock.refresh();
    expect(serverClock.now()).toBe(LOCAL_START + 200 + 5_000);
  });

  test('refreshIfStale reads once, stays quiet inside the interval and reads again after it', async () => {
    const script = scriptServerTime([replyWithServerTime(LOCAL_START)]);
    const { serverClock, local } = buildClock({ script });
    await serverClock.refreshIfStale();
    await serverClock.refreshIfStale();
    local.advance(REFRESH_INTERVAL - 1);
    await serverClock.refreshIfStale();
    expect(script.paths).toHaveLength(1);
    local.advance(1);
    await serverClock.refreshIfStale();
    expect(script.paths).toHaveLength(2);
  });

  test('refresh() always reads, whatever the interval', async () => {
    const script = scriptServerTime([replyWithServerTime(LOCAL_START)]);
    const { serverClock } = buildClock({ script });
    await serverClock.refresh();
    await serverClock.refresh();
    expect(script.paths).toHaveLength(2);
  });

  test('concurrent refreshIfStale calls share one request', async () => {
    const script = scriptServerTime([replyWithServerTime(LOCAL_START)]);
    const { serverClock } = buildClock({ script });
    await Promise.all([serverClock.refreshIfStale(), serverClock.refreshIfStale()]);
    expect(script.paths).toHaveLength(1);
  });
});

describe('server clock: when the server time cannot be read', () => {
  test.each([
    [
      'a network error',
      (): Promise<Response> => Promise.reject(new TypeError('fetch failed')),
      'TypeError',
    ],
    ['HTTP 503', replyWithStatus(503), 'MarketDataHttpError'],
    [
      'a body without serverTime',
      replyWithBody(JSON.stringify({ other: 1 })),
      'MarketDataResponseError',
    ],
    [
      'a non numeric serverTime',
      replyWithBody(JSON.stringify({ serverTime: 'x' })),
      'MarketDataResponseError',
    ],
    ['a body that is not JSON', replyWithBody('<html>'), 'SyntaxError'],
  ] as const)(
    '%s falls back to the local clock and warns with the error name only',
    async (_name, reply, errorName) => {
      const warnings: ServerClockWarning[] = [];
      const { serverClock } = buildClock({
        script: scriptServerTime([reply]),
        warnings,
      });
      await serverClock.refresh();
      expect(serverClock.now()).toBe(LOCAL_START);
      expect(warnings).toStrictEqual([{ errorName }]);
    },
  );

  test('a failure after a good reading keeps the last known offset', async () => {
    const warnings: ServerClockWarning[] = [];
    const { serverClock } = buildClock({
      script: scriptServerTime([replyWithServerTime(LOCAL_START + 4_000), replyWithStatus(500)]),
      warnings,
    });
    await serverClock.refresh();
    await serverClock.refresh();
    expect(serverClock.now()).toBe(LOCAL_START + 4_000);
    expect(warnings).toHaveLength(1);
  });

  test('a failed reading still counts as an attempt: refreshIfStale does not hammer the API', async () => {
    const script = scriptServerTime([replyWithStatus(500)]);
    const { serverClock } = buildClock({ script });
    await serverClock.refreshIfStale();
    await serverClock.refreshIfStale();
    expect(script.paths).toHaveLength(1);
  });
});

describe('REST client with the server clock', () => {
  const OPEN_TIME = 10 * HOUR;
  const STILL_OPEN_ROW = buildRawKline({
    openTime: OPEN_TIME,
    durationMilliseconds: HOUR,
    index: 0,
  });

  function buildRestClient(
    localNow: number,
    serverNow: number,
  ): ReturnType<typeof createMarketDataClient> {
    const local = createManualClock(localNow);
    const script = scriptServerTime([replyWithServerTime(serverNow)]);
    const serverClock = createServerClock({
      baseUrl: BASE_URL,
      fetchImplementation: script.fetchImplementation,
      now: local.now,
      refreshIntervalMilliseconds: REFRESH_INTERVAL,
    });
    return createMarketDataClient({
      baseUrl: BASE_URL,
      clock: serverClock,
      fetchImplementation: (url) =>
        new URL(url).pathname === '/api/v3/time'
          ? script.fetchImplementation(url, { signal: AbortSignal.timeout(1_000) })
          : Promise.resolve(Response.json([STILL_OPEN_ROW])),
    });
  }

  test('a local clock 3 s AHEAD does not let a candle that is still open be treated as closed', async () => {
    const closeTime = OPEN_TIME + HOUR - 1;
    const client = buildRestClient(closeTime + 2_000, closeTime - 1_000);
    expect(await client.fetchKlines({ symbol: 'BTCUSDT', timeframe: '1h' })).toHaveLength(0);
  });

  test('once the server clock says it closed, the candle is returned', async () => {
    const closeTime = OPEN_TIME + HOUR - 1;
    const client = buildRestClient(closeTime - 2_000, closeTime + 1_000);
    expect(await client.fetchKlines({ symbol: 'BTCUSDT', timeframe: '1h' })).toHaveLength(1);
  });
});

describe('server clock against a real HTTP server on loopback', () => {
  test('applies the skew the server reports', async () => {
    const server = startFakeBinanceStreamServer();
    try {
      server.setServerClockSkew(4_000);
      const serverClock = createServerClock({ baseUrl: server.restUrl });
      await serverClock.refresh();
      expect(server.serverTimeRequestCount()).toBe(1);
      expect(Math.abs(serverClock.now() - (Date.now() + 4_000))).toBeLessThan(1_000);
    } finally {
      await server.stop();
    }
  });
});
