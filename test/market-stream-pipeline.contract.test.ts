// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import type { Logger } from '../apps/api-ativada/src/logging/logger.js';
import {
  createFakeSocket,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const { applicationMarket } = await loadStreamApp();
const SKEW_MILLISECONDS = 5_000;
const STALE_SECONDS = 3;

type Received = { readonly message: Record<string, unknown>; readonly at: number };

let server: FakeBinanceStreamServer;
let market: ReturnType<typeof applicationMarket.createApplicationMarketStream> | undefined;

beforeEach(() => {
  server = startFakeBinanceStreamServer();
});

afterEach(async () => {
  await market?.close();
  market = undefined;
  await server.stop();
});

function silentLogger(): Logger {
  const ignore = (): void => undefined;
  return { debug: ignore, info: ignore, warn: ignore, error: ignore };
}

// O pipeline de produção inteiro: ticker real -> agregação -> publicação -> assinante, contra uma Binance falsa.
function startPipeline(isKlineEnabled = false): {
  readonly received: Received[];
  readonly subscriber: FakeStreamSocket;
} {
  const stream = applicationMarket.createApplicationMarketStream({
    environment: {
      MARKET_SYMBOLS: ['BTCUSDT', 'ETHUSDT'],
      MARKET_TIMEFRAMES: ['1h'],
      MARKET_DISPLAY_TIMEFRAMES: [],
      TICKER_KLINE_ENABLED: isKlineEnabled,
      BINANCE_BASE_URL: server.restUrl,
      BINANCE_STREAM_URL: server.streamUrl,
      TICKER_STALE_SECONDS: STALE_SECONDS,
      STREAM_MAX_PAIRS_PER_SOCKET: 10,
    },
    logger: silentLogger(),
    reportError: () => undefined,
  });
  market = stream;
  const received: Received[] = [];
  const subscriber = createFakeSocket();
  Object.assign(subscriber, {
    send: (text: string): number => {
      received.push({ message: JSON.parse(text) as Record<string, unknown>, at: Date.now() });
      return text.length;
    },
  });
  stream.publisher.subscriptions.subscribe(subscriber, ['BTCUSDT', 'ETHUSDT']);
  stream.start();
  return { received, subscriber };
}

function ticksOf(received: readonly Received[], symbol: string): Received[] {
  return received.filter(
    (item) => item.message['type'] === 'tick' && item.message['symbol'] === symbol,
  );
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function waitConnected(): Promise<void> {
  await waitFor(() => server.openConnectionCount() === 1, 'ticker conectado', 5_000);
}

describe('forming candle through the same pipeline', () => {
  const OPEN_TIME = 1_759_968_000_000;

  test('with the flag on, 30 kline events become ONE candle message; with it off, none and no kline subscription', async () => {
    const { received } = startPipeline(true);
    await waitConnected();
    expect(server.requestedStreams()).toStrictEqual([
      'btcusdt@miniTicker/ethusdt@miniTicker/btcusdt@kline_1h/ethusdt@kline_1h',
    ]);
    for (let index = 0; index < 30; index += 1) {
      server.sendEvent({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        openTime: OPEN_TIME,
        isClosed: false,
      });
    }
    await waitFor(
      () => received.some((item) => item.message['type'] === 'candle'),
      'vela publicada',
      4_000,
    );
    await Bun.sleep(1_300);
    const candles = received.filter((item) => item.message['type'] === 'candle');
    expect(candles).toHaveLength(1);
    expect(candles[0]?.message).toMatchObject({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: OPEN_TIME,
      closed: false,
    });
  });

  test('with the flag off the kline streams are not even subscribed', async () => {
    startPipeline(false);
    await waitConnected();
    expect(server.requestedStreams()).toStrictEqual(['btcusdt@miniTicker/ethusdt@miniTicker']);
  });
});

describe('public ticker pipeline against a fake Binance', () => {
  test('100 ticks in about a second become ONE publication, the last', async () => {
    const { received } = startPipeline();
    await waitConnected();
    for (let index = 1; index <= 100; index += 1) {
      server.sendTicker({
        symbol: 'BTCUSDT',
        price: `${30_000 + index}.00`,
        openPrice: '30000.00',
        eventTime: 1_000_000 + index,
      });
    }
    await waitFor(() => ticksOf(received, 'BTCUSDT').length >= 1, 'publicação', 4_000);
    await Bun.sleep(1_300);
    const published = ticksOf(received, 'BTCUSDT');
    expect(published).toHaveLength(1);
    expect(published[0]?.message).toMatchObject({
      price: '30100.00',
      at: 1_000_100,
      change24h: '0.3333',
    });
  });

  test('p95 from tick to subscriber stays under 2 s while ticks keep coming (about 6 s, two pairs)', async () => {
    const { received } = startPipeline();
    await waitConnected();
    const sentAt = new Map<string, number>();
    for (let index = 1; index <= 60; index += 1) {
      for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
        const eventTime = 2_000_000 + index;
        sentAt.set(`${symbol}:${eventTime}`, Date.now());
        server.sendTicker({ symbol, price: `${index}.00`, openPrice: '1.00', eventTime });
      }
      await Bun.sleep(100);
    }
    await waitFor(() => ticksOf(received, 'ETHUSDT').length >= 5, 'publicações', 4_000);
    await Bun.sleep(1_300);
    const latencies: number[] = [];
    for (const [key, sent] of sentAt) {
      const [symbol = '', eventTime = '0'] = key.split(':');
      const next = ticksOf(received, symbol).find(
        (item) => Number(item.message['at']) >= Number(eventTime),
      );
      expect(next).toBeDefined();
      latencies.push((next?.at ?? Infinity) - sent);
    }
    expect(percentile(latencies, 0.95)).toBeLessThan(2_000);
    for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
      const times = ticksOf(received, symbol).map((item) => item.at);
      const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(950);
    }
  }, 20_000);

  test('a dropped connection resumes WITHOUT publishing the same tick twice', async () => {
    const { received } = startPipeline();
    await waitConnected();
    server.sendTicker({
      symbol: 'BTCUSDT',
      price: '10.00',
      openPrice: '10.00',
      eventTime: 3_000_001,
    });
    await waitFor(() => ticksOf(received, 'BTCUSDT').length === 1, 'primeira publicação', 4_000);
    server.dropConnections();
    await waitFor(() => server.connectionCount() === 2, 'reconexão', 8_000);
    await waitFor(() => server.openConnectionCount() === 1, 'conexão aberta', 3_000);
    server.sendTicker({
      symbol: 'BTCUSDT',
      price: '10.00',
      openPrice: '10.00',
      eventTime: 3_000_001,
    });
    server.sendTicker({
      symbol: 'BTCUSDT',
      price: '11.00',
      openPrice: '10.00',
      eventTime: 3_000_002,
    });
    await waitFor(
      () => ticksOf(received, 'BTCUSDT').length === 2,
      'publicação depois da retomada',
      4_000,
    );
    await Bun.sleep(1_300);
    expect(ticksOf(received, 'BTCUSDT').map((item) => item.message['at'])).toStrictEqual([
      3_000_001, 3_000_002,
    ]);
  }, 20_000);

  test('no tick for the stale window seals the data as stale (once), and a new tick clears the seal', async () => {
    const { received } = startPipeline();
    await waitConnected();
    server.sendTicker({
      symbol: 'BTCUSDT',
      price: '10.00',
      openPrice: '10.00',
      eventTime: 4_000_001,
    });
    await waitFor(() => ticksOf(received, 'BTCUSDT').length === 1, 'primeira publicação', 4_000);
    await waitFor(
      () => ticksOf(received, 'BTCUSDT').some((item) => item.message['stale'] === true),
      'selo de dado velho',
      (STALE_SECONDS + 3) * 1_000,
    );
    await Bun.sleep(1_500);
    expect(
      ticksOf(received, 'BTCUSDT').filter((item) => item.message['stale'] === true),
    ).toHaveLength(1);
    server.sendTicker({
      symbol: 'BTCUSDT',
      price: '12.00',
      openPrice: '10.00',
      eventTime: 4_000_002,
    });
    await waitFor(
      () =>
        ticksOf(received, 'BTCUSDT').at(-1)?.message['stale'] === false &&
        ticksOf(received, 'BTCUSDT').length === 3,
      'selo limpo',
      4_000,
    );
  }, 30_000);

  test('the server time follows the Binance clock offset already measured', async () => {
    server.setServerClockSkew(SKEW_MILLISECONDS);
    const { received } = startPipeline();
    await waitConnected();
    await waitFor(() => server.serverTimeRequestCount() >= 1, 'hora do servidor medida', 4_000);
    await Bun.sleep(200);
    server.sendTicker({
      symbol: 'ETHUSDT',
      price: '5.00',
      openPrice: '5.00',
      eventTime: 5_000_001,
    });
    await waitFor(() => ticksOf(received, 'ETHUSDT').length === 1, 'publicação', 4_000);
    const delivered = ticksOf(received, 'ETHUSDT')[0];
    const offset = Number(delivered?.message['serverTime']) - (delivered?.at ?? 0);
    expect(Math.abs(offset - SKEW_MILLISECONDS)).toBeLessThan(500);
  });
});
