// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import type {
  RawCandle,
  TickerStream,
} from '../packages/market-data-crypto/src/ticker/ticker.types.js';
import { loadTickerApi } from './fixtures/ticker/ticker-source.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const { stream: streamModule } = await loadTickerApi();
// Múltiplo de 1 dia: o preço falso da Binance depende de abertura alinhada à vela.
const OPEN_TIME = 1_759_968_000_000;

let server: FakeBinanceStreamServer;
const opened: TickerStream[] = [];

beforeEach(() => {
  server = startFakeBinanceStreamServer();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((stream) => stream.close()));
  await server.stop();
});

function open(overrides: Partial<Parameters<typeof streamModule.createTickerStream>[0]> = {}): {
  readonly candles: RawCandle[];
  readonly malformed: string[];
  readonly attempts: number[];
} {
  const candles: RawCandle[] = [];
  const malformed: string[] = [];
  const attempts: number[] = [];
  opened.push(
    streamModule.createTickerStream({
      symbols: ['BTCUSDT', 'ETHUSDT'],
      timeframes: ['1h', '1d'],
      baseUrl: server.streamUrl,
      staleAfterMilliseconds: 5_000,
      reconnectBaseMilliseconds: 50,
      reconnectMaxMilliseconds: 200,
      random: () => 1,
      onTick: () => undefined,
      onCandle: (candle) => void candles.push(candle),
      onConnected: (event) => void attempts.push(event.attempt),
      onMalformed: (event) => void malformed.push(event.reason),
      ...overrides,
    }),
  );
  return { candles, malformed, attempts };
}

describe('ticker stream — the forming candle on the same connection', () => {
  test('ONE connection with the miniTicker and the kline names of every pair × candle size', async () => {
    const { attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    expect(server.connectionCount()).toBe(1);
    expect(server.requestedStreams()).toStrictEqual([
      'btcusdt@miniTicker/ethusdt@miniTicker/btcusdt@kline_1h/btcusdt@kline_1d/ethusdt@kline_1h/ethusdt@kline_1d',
    ]);
  });

  test('without candle sizes only the miniTicker is subscribed (the default)', async () => {
    const { attempts } = open({ timeframes: undefined });
    await waitFor(() => attempts.length === 1, 'conexão');
    expect(server.requestedStreams()).toStrictEqual(['btcusdt@miniTicker/ethusdt@miniTicker']);
  });

  test('delivers the OPEN candle (x false) and the closed one, with the flag', async () => {
    const { candles, attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendEvent({ symbol: 'BTCUSDT', timeframe: '1h', openTime: OPEN_TIME, isClosed: false });
    server.sendEvent({ symbol: 'BTCUSDT', timeframe: '1h', openTime: OPEN_TIME, isClosed: true });
    await waitFor(() => candles.length === 2, 'duas velas');
    expect(
      candles.map((candle) => [candle.symbol, candle.timeframe, candle.isClosed]),
    ).toStrictEqual([
      ['BTCUSDT', '1h', false],
      ['BTCUSDT', '1h', true],
    ]);
    expect(candles[0]).toMatchObject({ openTime: OPEN_TIME, volume: '12.50000000' });
  });

  test('a candle size that was not subscribed is discarded as unsubscribed, never delivered', async () => {
    const { candles, malformed, attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendEvent({ symbol: 'BTCUSDT', timeframe: '15m', openTime: OPEN_TIME, isClosed: false });
    await waitFor(() => malformed.length === 1, 'descarte');
    expect(malformed).toStrictEqual(['unsubscribed']);
    expect(candles).toStrictEqual([]);
  });

  test('a pair that was not subscribed is discarded as unsubscribed', async () => {
    const { candles, malformed, attempts } = open();
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendEvent({ symbol: 'SOLUSDT', timeframe: '1h', openTime: OPEN_TIME, isClosed: false });
    await waitFor(() => malformed.length === 1, 'descarte');
    expect(candles).toStrictEqual([]);
  });

  test('without onCandle the candle is read and dropped, and the mini-ticker still arrives', async () => {
    const ticks: string[] = [];
    const { malformed, attempts } = open({
      onCandle: undefined,
      onTick: (tick) => void ticks.push(tick.symbol),
    });
    await waitFor(() => attempts.length === 1, 'conexão');
    server.sendEvent({ symbol: 'BTCUSDT', timeframe: '1h', openTime: OPEN_TIME, isClosed: false });
    server.sendTicker({ symbol: 'BTCUSDT', price: '1', openPrice: '1', eventTime: 1 });
    await waitFor(() => ticks.length === 1, 'tick');
    expect(malformed).toStrictEqual([]);
  });
});
