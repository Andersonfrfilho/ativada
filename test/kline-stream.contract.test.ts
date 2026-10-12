// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  createKlineStream,
  MarketDataInvalidRequestError,
} from '../packages/market-data-crypto/src/index.js';
import { buildFakePrice } from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import {
  createStreamHarness,
  FIRST_OPEN_TIME,
  HOUR,
  type StreamHarness,
} from './fixtures/kline-stream-harness.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const SECRET_MARKER = 'SEGREDO_NAO_VAZAR';
const FIRST_CONNECTION = 'first connection';

let harness: StreamHarness;

beforeEach(() => {
  harness = createStreamHarness();
});

afterEach(async () => {
  await harness.closeAll();
});

function buildKlineMessage(overrides: { readonly symbol: string; readonly open: string }): string {
  const { symbol } = overrides;
  return JSON.stringify({
    stream: `${symbol.toLowerCase()}@kline_1h`,
    data: {
      e: 'kline',
      E: 1,
      s: symbol,
      k: {
        t: 1,
        T: 2,
        s: symbol,
        i: '1h',
        o: overrides.open,
        c: '1',
        h: '1',
        l: '1',
        v: '1',
        n: 1,
        x: true,
      },
    },
  });
}

describe('kline stream: subscription and delivery', () => {
  test('subscribes to one combined stream with lowercase names, symbols times timeframes', async () => {
    const opened = harness.open();
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    expect(harness.server.requestedStreams()).toStrictEqual([
      'btcusdt@kline_1h/btcusdt@kline_4h/ethusdt@kline_1h/ethusdt@kline_4h',
    ]);
  });

  test('delivers a closed candle (x=true) with exact decimal strings', async () => {
    const opened = harness.open();
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    harness.sendClosed(FIRST_OPEN_TIME);
    await waitFor(() => opened.candles.length === 1, 'closed candle delivered');
    const price = buildFakePrice({ openTime: FIRST_OPEN_TIME, timeframe: '1h' });
    expect(opened.candles).toStrictEqual([
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        openTime: FIRST_OPEN_TIME,
        closeTime: FIRST_OPEN_TIME + HOUR - 1,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: '12.50000000',
        tradeCount: 7,
      },
    ]);
  });

  test('ignores an open candle (x=false) and delivers the closed one after it', async () => {
    const opened = harness.open();
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    harness.server.sendEvent({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: FIRST_OPEN_TIME,
      isClosed: false,
    });
    harness.sendClosed(FIRST_OPEN_TIME);
    await waitFor(() => opened.candles.length === 1, 'closed candle delivered');
    expect(opened.candles).toHaveLength(1);
    expect(opened.stream.stats().ignoredOpenCount).toBe(1);
  });
});

describe('kline stream: malformed messages', () => {
  test('discards malformed, unknown and unsubscribed messages without dropping the connection or echoing them', async () => {
    const opened = harness.open();
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    harness.server.sendText('{ isso nao e json');
    harness.server.sendText(
      JSON.stringify({ stream: 'x', data: { e: '24hrMiniTicker', s: 'BTCUSDT' } }),
    );
    harness.server.sendText(JSON.stringify({ result: null, id: 1 }));
    harness.server.sendText(buildKlineMessage({ symbol: 'BTCUSDT', open: SECRET_MARKER }));
    harness.server.sendText(buildKlineMessage({ symbol: 'SOLUSDT', open: '1' }));
    harness.sendClosed(FIRST_OPEN_TIME);
    await waitFor(() => opened.candles.length === 1, 'valid candle after the noise');
    expect(opened.malformedReasons).toHaveLength(5);
    expect(opened.stream.stats().malformedCount).toBe(5);
    expect(opened.disconnections).toStrictEqual([]);
    expect(harness.server.connectionCount()).toBe(1);
    expect(JSON.stringify(opened.malformedReasons)).not.toContain(SECRET_MARKER);
  });

  test('a handler that throws or rejects does not drop the connection', async () => {
    let calls = 0;
    const opened = harness.open({
      onCandle: (candle) => {
        calls += 1;
        if (calls === 1) throw new Error('falha síncrona');
        if (calls === 2) return Promise.reject(new Error('falha assíncrona'));
        return void opened.candles.push(candle);
      },
    });
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    for (const offset of [0, 1, 2]) harness.sendClosed(FIRST_OPEN_TIME + offset * HOUR);
    await waitFor(() => opened.candles.length === 1, 'third candle delivered');
    expect(opened.stream.stats().handlerFailureCount).toBe(2);
    expect(harness.server.connectionCount()).toBe(1);
  });
});

describe('kline stream: close and settings', () => {
  test('close() on a live connection ends it, is idempotent and nothing is delivered later', async () => {
    const opened = harness.open();
    await waitFor(() => opened.attempts.length === 1, FIRST_CONNECTION);
    await opened.stream.close();
    await opened.stream.close();
    await waitFor(
      () => harness.server.openConnectionCount() === 0,
      'server sees the socket closed',
    );
    harness.sendClosed(FIRST_OPEN_TIME);
    await Bun.sleep(100);
    expect(opened.candles).toStrictEqual([]);
    expect(opened.disconnections).toStrictEqual([]);
  });

  test.each([
    ['a lowercase symbol', { symbols: ['btcusdt'] }],
    ['no symbol', { symbols: [] }],
    ['no timeframe', { timeframes: [] }],
    ['an unsupported timeframe', { timeframes: ['1m' as never] }],
    ['a non websocket base URL', { baseUrl: 'https://data-stream.binance.vision' }],
    ['a zero stale limit', { staleAfterMilliseconds: 0 }],
  ])('rejects %s at creation', (_name, overrides) => {
    expect(() =>
      createKlineStream({
        symbols: ['BTCUSDT'],
        timeframes: ['1h'],
        baseUrl: harness.server.streamUrl,
        onCandle: () => undefined,
        ...overrides,
      }),
    ).toThrow(MarketDataInvalidRequestError);
  });
});
