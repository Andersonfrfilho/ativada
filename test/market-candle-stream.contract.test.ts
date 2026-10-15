// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RawCandle } from '../packages/market-data-crypto/src/ticker/ticker.types.js';
import {
  createFakeSocket,
  USER_B,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';
import { createManualTimers } from './fixtures/ticker/manual-timers.fixture.js';

const { marketPublisher } = await loadStreamApp();
const PAIRS = ['BTCUSDT', 'ETHUSDT'];
const INTERVAL = 1_000;
const START = 1_760_000_000_000;

function candle(symbol: string, timeframe: RawCandle['timeframe'], index: number): RawCandle {
  return {
    symbol,
    timeframe,
    openTime: START,
    open: '100.00',
    high: '120.00',
    low: '90.00',
    close: `${100 + index}.00`,
    volume: '12.50',
    isClosed: index === 99,
    eventTime: START + index,
  };
}

function open(): {
  readonly timers: ReturnType<typeof createManualTimers>;
  readonly publisher: ReturnType<typeof marketPublisher.createMarketPublisher<number>>;
} {
  const timers = createManualTimers();
  const publisher = marketPublisher.createMarketPublisher<number>({
    pairs: PAIRS,
    maxPairsPerSocket: 3,
    staleAfterMilliseconds: 10_000,
    now: () => START,
    serverTime: () => START,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    reportError: () => undefined,
  });
  return { timers, publisher };
}

function candlesOf(socket: FakeStreamSocket): Record<string, unknown>[] {
  return socket.sent
    .map((text) => JSON.parse(text) as Record<string, unknown>)
    .filter((message) => message['type'] === 'candle');
}

describe('market stream — the forming candle', () => {
  test('50 events in one second are ONE candle message, the last, with the documented shape', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    for (let index = 50; index <= 99; index += 1) {
      publisher.handleRawCandle(candle('BTCUSDT', '1h', index));
      timers.advance(15);
    }
    timers.advance(INTERVAL);
    expect(candlesOf(socket)).toStrictEqual([
      {
        type: 'candle',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        openTime: START,
        open: '100.00',
        high: '120.00',
        low: '90.00',
        close: '199.00',
        volume: '12.50',
        closed: true,
        at: START + 99,
      },
    ]);
  });

  test('each candle size of the pair is its own stream of messages', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawCandle(candle('BTCUSDT', '1h', 1));
    publisher.handleRawCandle(candle('BTCUSDT', '4h', 2));
    timers.advance(INTERVAL);
    expect(
      candlesOf(socket)
        .map((message) => message['timeframe'])
        .sort(),
    ).toStrictEqual(['1h', '4h']);
  });

  test('a pair that the socket did not subscribe never receives it, and another user subscribed to it does', () => {
    const { publisher, timers } = open();
    const ofBitcoin = createFakeSocket();
    const ofEther = createFakeSocket({ userId: USER_B });
    const ofNothing = createFakeSocket();
    publisher.subscriptions.subscribe(ofBitcoin, ['BTCUSDT']);
    publisher.subscriptions.subscribe(ofEther, ['ETHUSDT']);
    publisher.handleRawCandle(candle('BTCUSDT', '1h', 1));
    timers.advance(INTERVAL);
    expect(candlesOf(ofBitcoin)).toHaveLength(1);
    expect(candlesOf(ofEther)).toHaveLength(0);
    expect(ofNothing.sent).toStrictEqual([]);
  });

  test('a pair outside the configured list is ignored; unsubscribing and closing stop the delivery', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawCandle(candle('SOLUSDT', '1h', 1));
    timers.advance(INTERVAL);
    expect(candlesOf(socket)).toHaveLength(0);
    publisher.subscriptions.unsubscribe(socket, ['BTCUSDT']);
    publisher.handleRawCandle(candle('BTCUSDT', '1h', 2));
    timers.advance(INTERVAL);
    expect(candlesOf(socket)).toHaveLength(0);
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawCandle(candle('BTCUSDT', '1h', 3));
    publisher.close();
    timers.advance(INTERVAL * 2);
    publisher.handleRawCandle(candle('BTCUSDT', '1h', 4));
    timers.advance(INTERVAL * 2);
    expect(candlesOf(socket)).toHaveLength(0);
  });
});
