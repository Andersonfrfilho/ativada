// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../packages/market-data/test-support/fake-binance-stream-server.js';
import type { RawTick, TickerStream } from '../packages/market-data/src/ticker/ticker.types.js';
import { loadTickerApi } from './fixtures/ticker/ticker-source.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const { schema, stream: streamModule } = await loadTickerApi();
const BASE_DELAY = 50;
const MAX_DELAY = 200;

let server: FakeBinanceStreamServer;
const opened: TickerStream[] = [];

beforeEach(() => {
  server = startFakeBinanceStreamServer();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((stream) => stream.close()));
  await server.stop();
});

type Opened = {
  readonly stream: TickerStream;
  readonly ticks: RawTick[];
  readonly attempts: number[];
  readonly disconnections: string[];
  readonly malformed: string[];
};

function open(
  overrides: Partial<Parameters<typeof streamModule.createTickerStream>[0]> = {},
): Opened {
  const ticks: RawTick[] = [];
  const attempts: number[] = [];
  const disconnections: string[] = [];
  const malformed: string[] = [];
  const stream = streamModule.createTickerStream({
    symbols: ['BTCUSDT', 'ETHUSDT'],
    baseUrl: server.streamUrl,
    staleAfterMilliseconds: 5_000,
    reconnectBaseMilliseconds: BASE_DELAY,
    reconnectMaxMilliseconds: MAX_DELAY,
    random: () => 1,
    onTick: (tick) => void ticks.push(tick),
    onConnected: (event) => void attempts.push(event.attempt),
    onDisconnected: (event) => void disconnections.push(event.reason),
    onMalformed: (event) => void malformed.push(event.reason),
    ...overrides,
  });
  opened.push(stream);
  return { stream, ticks, attempts, disconnections, malformed };
}

describe('mini-ticker message parsing', () => {
  const valid = {
    stream: 'btcusdt@miniTicker',
    data: { e: '24hrMiniTicker', E: 1_760_000_000_123, s: 'BTCUSDT', c: '30000.50', o: '29500.00' },
  };

  test('reads price, 24 h open price and event time as given (decimal text, no float)', () => {
    expect(schema.parseTickerMessage(JSON.stringify(valid))).toStrictEqual({
      kind: 'tick',
      tick: {
        symbol: 'BTCUSDT',
        price: '30000.50',
        openPrice: '29500.00',
        eventTime: 1_760_000_000_123,
      },
    });
  });

  test.each([
    ['not JSON', 'isto não é json', 'invalid-json'],
    [
      'another event type',
      JSON.stringify({ ...valid, data: { ...valid.data, e: 'kline' } }),
      'unknown-shape',
    ],
    [
      'a price that is not decimal text',
      JSON.stringify({ ...valid, data: { ...valid.data, c: 30000.5 } }),
      'unknown-shape',
    ],
    [
      'an exponent price',
      JSON.stringify({ ...valid, data: { ...valid.data, c: '1e5' } }),
      'unknown-shape',
    ],
    [
      'a stream name that disagrees with the symbol',
      JSON.stringify({ ...valid, stream: 'ethusdt@miniTicker' }),
      'unknown-shape',
    ],
    [
      'a lowercase symbol',
      JSON.stringify({ ...valid, data: { ...valid.data, s: 'btcusdt' } }),
      'unknown-shape',
    ],
    [
      'a missing field',
      JSON.stringify({ ...valid, data: { e: valid.data.e, E: 1, s: 'BTCUSDT' } }),
      'unknown-shape',
    ],
  ])('discards %s with a fixed reason and no echo', (_name, text, reason) => {
    const message = schema.parseTickerMessage(text);
    expect(message as unknown).toStrictEqual({ kind: 'malformed', reason });
  });
});

describe('ticker stream — one connection, reconnection without duplicating', () => {
  test('opens ONE connection for every pair, with the combined miniTicker stream names', async () => {
    const { attempts } = open();
    await waitFor(() => attempts.length === 1, 'primeira conexão');
    expect(server.connectionCount()).toBe(1);
    expect(server.requestedStreams()).toStrictEqual(['btcusdt@miniTicker/ethusdt@miniTicker']);
  });

  test('delivers each valid tick, in order', async () => {
    const { ticks, attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendTicker({ symbol: 'BTCUSDT', price: '30000', openPrice: '29000', eventTime: 1 });
    server.sendTicker({ symbol: 'ETHUSDT', price: '2000', openPrice: '1900', eventTime: 2 });
    await waitFor(() => ticks.length === 2, 'dois ticks');
    expect(ticks.map((tick) => `${tick.symbol}:${tick.eventTime}`)).toStrictEqual([
      'BTCUSDT:1',
      'ETHUSDT:2',
    ]);
  });

  test('a dropped connection is reopened with exponential backoff and the stream resumes', async () => {
    const { ticks, attempts, disconnections } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendTicker({ symbol: 'BTCUSDT', price: '1', openPrice: '1', eventTime: 1 });
    await waitFor(() => ticks.length === 1, 'tick antes da queda');
    server.dropConnections();
    await waitFor(() => attempts.length === 2, 'reconexão');
    expect(disconnections).toStrictEqual(['server-closed']);
    expect(server.connectionCount()).toBe(2);
    server.sendTicker({ symbol: 'BTCUSDT', price: '2', openPrice: '1', eventTime: 2 });
    await waitFor(() => ticks.length === 2, 'tick depois da retomada');
    expect(ticks.map((tick) => tick.eventTime)).toStrictEqual([1, 2]);
  });

  test('refused connections keep being retried until one opens', async () => {
    server.refuseConnections(true);
    const { attempts, disconnections } = open();
    await waitFor(() => disconnections.length >= 3, 'três tentativas recusadas');
    server.refuseConnections(false);
    await waitFor(() => attempts.length >= 1, 'conexão aceita');
    expect(disconnections.every((reason) => reason === 'connection-failed')).toBe(true);
  });

  test('a silent connection is replaced by the watchdog', async () => {
    const { attempts, disconnections } = open({ staleAfterMilliseconds: 150 });
    await waitFor(() => attempts.length === 1, 'conexão');
    await waitFor(() => disconnections.includes('stale'), 'conexão muda detectada');
    await waitFor(() => attempts.length >= 2, 'nova conexão');
  });

  test('a message of another pair is discarded and counted, not delivered', async () => {
    const { ticks, malformed, attempts, stream } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendTicker({ symbol: 'XRPUSDT', price: '1', openPrice: '1', eventTime: 1 });
    server.sendText('lixo');
    await waitFor(() => malformed.length === 2, 'duas descartadas');
    expect(malformed).toStrictEqual(['unsubscribed', 'invalid-json']);
    expect(stream.stats().malformedCount).toBe(2);
    expect(stream.stats().deliveredCount).toBe(0);
    expect(ticks).toStrictEqual([]);
  });

  test('a consumer that throws does not drop the connection', async () => {
    const seen: number[] = [];
    const { stream, attempts } = open({
      onTick: (tick) => {
        seen.push(tick.eventTime);
        if (tick.eventTime === 1) throw new Error('consumidor quebrado');
      },
    });
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendTicker({ symbol: 'BTCUSDT', price: '1', openPrice: '1', eventTime: 1 });
    server.sendTicker({ symbol: 'BTCUSDT', price: '1', openPrice: '1', eventTime: 2 });
    await waitFor(() => seen.length === 2, 'dois ticks');
    expect(stream.stats().handlerFailureCount).toBe(1);
    expect(server.connectionCount()).toBe(1);
  });

  test('close() stops reconnecting', async () => {
    const { stream, attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    await stream.close();
    server.dropConnections();
    await Bun.sleep(300);
    expect(server.connectionCount()).toBe(1);
  });

  test.each([
    ['no symbol', { symbols: [] }],
    ['a lowercase symbol', { symbols: ['btcusdt'] }],
    ['a base URL that is not ws', { baseUrl: 'http://127.0.0.1:1' }],
    ['a zero backoff', { reconnectBaseMilliseconds: 0 }],
  ])('refuses %s at creation', (_name, overrides) => {
    expect(() => open(overrides)).toThrow();
  });
});
