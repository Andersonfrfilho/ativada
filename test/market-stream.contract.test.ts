// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AggregatedTick } from '../packages/market-data-crypto/src/ticker/price-tick-listener.js';
import {
  createFakeSocket,
  USER_A,
  USER_B,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';
import { createManualTimers, tick } from './fixtures/ticker/manual-timers.fixture.js';

const { marketPublisher, marketPubSub, marketError } = await loadStreamApp();
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const INTERVAL = 1_000;
const STALE_AFTER = 10_000;
const SERVER_TIME_OFFSET = 7_500;
const START = 1_760_000_000_000;

type Harness = {
  readonly timers: ReturnType<typeof createManualTimers>;
  readonly publisher: ReturnType<typeof marketPublisher.createMarketPublisher<number>>;
  readonly errors: unknown[];
  readonly clock: { now: number };
};

function open(maxPairsPerSocket = 3): Harness {
  const timers = createManualTimers();
  const clock = { now: START };
  const errors: unknown[] = [];
  const publisher = marketPublisher.createMarketPublisher<number>({
    pairs: PAIRS,
    maxPairsPerSocket,
    staleAfterMilliseconds: STALE_AFTER,
    now: () => clock.now,
    serverTime: () => clock.now + SERVER_TIME_OFFSET,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    reportError: (error) => void errors.push(error),
  });
  return { timers, publisher, errors, clock };
}

function ticksOf(socket: FakeStreamSocket): Record<string, unknown>[] {
  return socket.sent
    .map((text) => JSON.parse(text) as Record<string, unknown>)
    .filter((message) => message['type'] === 'tick');
}

function lastMessage(socket: FakeStreamSocket): Record<string, unknown> {
  return JSON.parse(socket.sent.at(-1) ?? '{}') as Record<string, unknown>;
}

describe('market stream — subscribe, receive, unsubscribe', () => {
  test('a subscriber is told what it is subscribed to', () => {
    const { publisher } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['ETHUSDT', 'BTCUSDT']);
    expect(JSON.parse(socket.sent[0] ?? '{}')).toStrictEqual({
      type: 'subscribed',
      pairs: ['BTCUSDT', 'ETHUSDT'],
    });
  });

  test('the tick reaches the subscribers of THAT pair and nobody else', () => {
    const { publisher, timers } = open();
    const ofBitcoin = createFakeSocket();
    const ofEther = createFakeSocket({ userId: USER_B });
    const ofNothing = createFakeSocket();
    publisher.subscriptions.subscribe(ofBitcoin, ['BTCUSDT']);
    publisher.subscriptions.subscribe(ofEther, ['ETHUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    expect(ticksOf(ofBitcoin)).toHaveLength(1);
    expect(ticksOf(ofEther)).toHaveLength(0);
    expect(ofNothing.sent).toStrictEqual([]);
  });

  test('100 raw ticks in one second are ONE message, the last, with the documented shape', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    for (let index = 1; index <= 100; index += 1) {
      publisher.handleRawTick({
        symbol: 'BTCUSDT',
        price: `${30_000 + index}.00`,
        openPrice: '30000.00',
        eventTime: START + index,
      });
      timers.advance(9);
    }
    timers.advance(INTERVAL);
    expect(ticksOf(socket)).toStrictEqual([
      {
        type: 'tick',
        symbol: 'BTCUSDT',
        price: '30100.00',
        change24h: '0.3333',
        at: START + 100,
        serverTime: START + SERVER_TIME_OFFSET,
        stale: false,
      },
    ]);
  });

  test('unsubscribing stops the delivery of that pair only', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT', 'ETHUSDT']);
    publisher.subscriptions.unsubscribe(socket, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    publisher.handleRawTick(tick('ETHUSDT', 2));
    timers.advance(INTERVAL);
    expect(ticksOf(socket).map((message) => message['symbol'])).toStrictEqual(['ETHUSDT']);
    expect([...socket.data.subscribedPairs]).toStrictEqual(['ETHUSDT']);
  });

  test('subscribing twice to the same pair delivers each tick once', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    expect(ticksOf(socket)).toHaveLength(1);
  });

  test('a closed socket loses every subscription', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT', 'ETHUSDT']);
    publisher.subscriptions.removeSocket(socket);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    expect(ticksOf(socket)).toHaveLength(0);
    expect(socket.data.subscribedPairs.size).toBe(0);
  });

  test('a late subscriber receives the last tick right away (a snapshot), not a blank screen', () => {
    const { publisher, timers } = open();
    publisher.handleRawTick(tick('BTCUSDT', 5));
    timers.advance(INTERVAL);
    const late = createFakeSocket();
    publisher.subscriptions.subscribe(late, ['BTCUSDT']);
    expect(JSON.parse(late.sent[0] ?? '{}')).toMatchObject({ type: 'subscribed' });
    expect(lastMessage(late)).toMatchObject({
      type: 'tick',
      symbol: 'BTCUSDT',
      at: 5,
      stale: false,
    });
  });
});

describe('market stream — only enabled pairs, with typed errors', () => {
  test('a pair that does not exist is a typed error and nothing is subscribed', () => {
    const { publisher } = open();
    const socket = createFakeSocket();
    let failure: unknown;
    try {
      publisher.subscriptions.subscribe(socket, ['BTCUSDT', 'XYZUSDT']);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(marketError.UnsupportedPairError);
    expect(failure).toMatchObject({ code: 'PAIR_NOT_SUPPORTED', pair: 'XYZUSDT' });
    expect(socket.sent).toStrictEqual([]);
    expect(socket.data.subscribedPairs.size).toBe(0);
  });

  test('the per-socket ceiling counts what is already subscribed', () => {
    const { publisher } = open(2);
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT', 'ETHUSDT']);
    let failure: unknown;
    try {
      publisher.subscriptions.subscribe(socket, ['SOLUSDT']);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(marketError.TooManyPairsError);
    expect(failure).toMatchObject({ code: 'TOO_MANY_PAIRS' });
    expect(socket.data.subscribedPairs.size).toBe(2);
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
  });

  test('the ceiling is per socket: another socket has its own', () => {
    const { publisher } = open(1);
    publisher.subscriptions.subscribe(createFakeSocket(), ['BTCUSDT']);
    publisher.subscriptions.subscribe(createFakeSocket({ userId: USER_B }), ['ETHUSDT']);
  });
});

describe('market stream — stale data seal and server time', () => {
  test('after the stale window with no tick, subscribers get ONE tick marked stale, then silence', () => {
    const { publisher, timers, clock } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    clock.now += STALE_AFTER;
    publisher.sweepStale();
    publisher.sweepStale();
    const messages = ticksOf(socket);
    expect(messages.map((message) => message['stale'])).toStrictEqual([false, true]);
    expect(messages[1]).toMatchObject({ symbol: 'BTCUSDT', at: 1 });
  });

  test('exactly at the limit the data is still fresh', () => {
    const { publisher, timers, clock } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    clock.now += STALE_AFTER - 1;
    publisher.sweepStale();
    expect(ticksOf(socket)).toHaveLength(1);
  });

  test('a new tick clears the seal', () => {
    const { publisher, timers, clock } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    clock.now += STALE_AFTER;
    publisher.sweepStale();
    publisher.handleRawTick(tick('BTCUSDT', 2));
    timers.advance(INTERVAL);
    expect(ticksOf(socket).map((message) => message['stale'])).toStrictEqual([false, true, false]);
    // O selo volta a valer: um segundo silêncio é avisado de novo.
    clock.now += STALE_AFTER;
    publisher.sweepStale();
    expect(ticksOf(socket).map((message) => message['stale'])).toStrictEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  test('a late subscriber to an old tick gets the snapshot already sealed as stale', () => {
    const { publisher, timers, clock } = open();
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    clock.now += STALE_AFTER + 1;
    const late = createFakeSocket();
    publisher.subscriptions.subscribe(late, ['BTCUSDT']);
    expect(lastMessage(late)).toMatchObject({ stale: true });
  });

  test('the pair with no tick yet publishes nothing stale (there is nothing to be stale about)', () => {
    const { publisher, clock } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['SOLUSDT']);
    clock.now += STALE_AFTER * 5;
    publisher.sweepStale();
    expect(ticksOf(socket)).toHaveLength(0);
  });

  test('every tick carries the server time from the Binance clock offset', () => {
    const { publisher, timers, clock } = open();
    const socket = createFakeSocket();
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    clock.now += 123;
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    expect(ticksOf(socket)[0]?.['serverTime']).toBe(
      START + 123 + INTERVAL * 0 + SERVER_TIME_OFFSET,
    );
  });
});

describe('market stream — the price tick listener port (Phase 4b)', () => {
  test('a listener receives each AGGREGATED tick exactly once (100 raw ticks = 1 call)', () => {
    const { publisher, timers } = open();
    const received: AggregatedTick[] = [];
    publisher.addListener({ onTick: (aggregated) => void received.push(aggregated) });
    for (let index = 1; index <= 100; index += 1) {
      publisher.handleRawTick({
        symbol: 'BTCUSDT',
        price: `${30_000 + index}.00`,
        openPrice: '30000.00',
        eventTime: START + index,
      });
      timers.advance(9);
    }
    timers.advance(INTERVAL);
    expect(received).toStrictEqual([
      { symbol: 'BTCUSDT', price: '30100.00', change24h: '0.3333', eventTime: START + 100 },
    ]);
  });

  test('every registered listener gets the tick; a failing one (throw or reject) is reported and the others still run', async () => {
    const { publisher, timers, errors } = open();
    const first: number[] = [];
    const last: number[] = [];
    publisher.addListener({
      onTick: () => {
        throw new Error('ouvinte quebrado');
      },
    });
    publisher.addListener({ onTick: () => Promise.reject(new Error('ouvinte rejeitado')) });
    publisher.addListener({ onTick: (aggregated) => void first.push(aggregated.eventTime) });
    publisher.addListener({ onTick: (aggregated) => void last.push(aggregated.eventTime) });
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    await Promise.resolve();
    await Promise.resolve();
    expect(first).toStrictEqual([1]);
    expect(last).toStrictEqual([1]);
    expect(errors).toHaveLength(2);
  });

  test('a removed listener stops receiving', () => {
    const { publisher, timers } = open();
    const received: number[] = [];
    const remove = publisher.addListener({
      onTick: (aggregated) => void received.push(aggregated.eventTime),
    });
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    remove();
    publisher.handleRawTick(tick('BTCUSDT', 2));
    timers.advance(INTERVAL);
    expect(received).toStrictEqual([1]);
  });

  test('the listener receives a tick even when nobody is subscribed (alerts do not need a socket)', () => {
    const { publisher, timers } = open();
    const received: number[] = [];
    publisher.addListener({ onTick: (aggregated) => void received.push(aggregated.eventTime) });
    publisher.handleRawTick(tick('ETHUSDT', 4));
    timers.advance(INTERVAL);
    expect(received).toStrictEqual([4]);
  });

  test('after close() nothing more is published or delivered', () => {
    const { publisher, timers } = open();
    const socket = createFakeSocket();
    const received: number[] = [];
    publisher.subscriptions.subscribe(socket, ['BTCUSDT']);
    publisher.addListener({ onTick: (aggregated) => void received.push(aggregated.eventTime) });
    publisher.handleRawTick(tick('BTCUSDT', 1));
    publisher.close();
    timers.advance(INTERVAL * 3);
    publisher.handleRawTick(tick('BTCUSDT', 2));
    timers.advance(INTERVAL * 3);
    expect(ticksOf(socket)).toHaveLength(0);
    expect(received).toStrictEqual([]);
  });
});

describe('market stream — public data, nothing of any user', () => {
  test('two users subscribed to the same pair get the SAME bytes, and no user field is in the message', () => {
    const { publisher, timers } = open();
    const ofA = createFakeSocket({ userId: USER_A });
    const ofB = createFakeSocket({ userId: USER_B });
    publisher.subscriptions.subscribe(ofA, ['BTCUSDT']);
    publisher.subscriptions.subscribe(ofB, ['BTCUSDT']);
    publisher.handleRawTick(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    const tickA = ofA.sent.at(-1);
    expect(tickA).toBe(ofB.sent.at(-1));
    expect(tickA).not.toContain(USER_A);
    expect(tickA).not.toContain(USER_B);
    expect(tickA).not.toContain('subject');
    expect(Object.keys(JSON.parse(tickA ?? '{}') as object).sort()).toStrictEqual([
      'at',
      'change24h',
      'price',
      'serverTime',
      'stale',
      'symbol',
      'type',
    ]);
  });

  test('the topic of a pair is market:<PAIR> and the pub/sub holds only the sockets that asked', () => {
    const pubsub = marketPubSub.createMarketPubSub();
    const asked = createFakeSocket();
    const other = createFakeSocket({ userId: USER_B });
    pubsub.subscribe(marketPubSub.marketTopic('BTCUSDT'), asked);
    expect(marketPubSub.marketTopic('BTCUSDT')).toBe('market:BTCUSDT');
    expect(pubsub.publish('market:BTCUSDT', { type: 'tick' })).toBe(1);
    expect(asked.sent).toHaveLength(1);
    expect(other.sent).toStrictEqual([]);
    pubsub.removeSocket(asked);
    expect(pubsub.subscriberCount('market:BTCUSDT')).toBe(0);
  });
});
