// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadTickerApi } from './fixtures/ticker/ticker-source.fixture.js';
import { createManualTimers, tick } from './fixtures/ticker/manual-timers.fixture.js';

const { aggregator } = await loadTickerApi();
const INTERVAL = 1_000;

function open(): {
  readonly timers: ReturnType<typeof createManualTimers>;
  readonly published: ReturnType<typeof tick>[];
  readonly instance: ReturnType<typeof aggregator.createTickAggregator>;
} {
  const timers = createManualTimers();
  const published: ReturnType<typeof tick>[] = [];
  const instance = aggregator.createTickAggregator({
    intervalMilliseconds: INTERVAL,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    publish: (aggregated) => void published.push(aggregated),
  });
  return { timers, published, instance };
}

describe('tick aggregator — at most one publication per second per pair', () => {
  test('100 ticks in one second become ONE publication: the last one', () => {
    const { timers, published, instance } = open();
    for (let index = 1; index <= 100; index += 1) {
      instance.push(tick('BTCUSDT', index));
      timers.advance(9);
    }
    timers.advance(INTERVAL);
    expect(published).toStrictEqual([tick('BTCUSDT', 100)]);
  });

  test('nothing is published before the window closes', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 1));
    timers.advance(INTERVAL - 1);
    expect(published).toStrictEqual([]);
    timers.advance(1);
    expect(published).toStrictEqual([tick('BTCUSDT', 1)]);
  });

  test('a tick after the publication opens a new window (never two publications less than a second apart)', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 1));
    timers.advance(INTERVAL);
    timers.advance(300);
    instance.push(tick('BTCUSDT', 2));
    timers.advance(INTERVAL - 1);
    expect(published).toHaveLength(1);
    timers.advance(1);
    expect(published.map((item) => item.eventTime)).toStrictEqual([1, 2]);
    const times = timers.firedAt;
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(INTERVAL);
  });

  test('each pair has its own window', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 1));
    timers.advance(400);
    instance.push(tick('ETHUSDT', 2));
    instance.push(tick('BTCUSDT', 3));
    timers.advance(600);
    expect(published.map((item) => `${item.symbol}:${item.eventTime}`)).toStrictEqual([
      'BTCUSDT:3',
    ]);
    timers.advance(400);
    expect(published.map((item) => `${item.symbol}:${item.eventTime}`)).toStrictEqual([
      'BTCUSDT:3',
      'ETHUSDT:2',
    ]);
  });

  test('a duplicate or older tick (same or lower event time) is ignored — nothing is published twice', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 10));
    timers.advance(INTERVAL);
    instance.push(tick('BTCUSDT', 10));
    instance.push(tick('BTCUSDT', 9));
    timers.advance(INTERVAL * 2);
    expect(published).toStrictEqual([tick('BTCUSDT', 10)]);
  });

  test('the older tick inside a window does not replace the newer one', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 20));
    instance.push(tick('BTCUSDT', 19));
    timers.advance(INTERVAL);
    expect(published).toStrictEqual([tick('BTCUSDT', 20)]);
  });

  test('close() cancels the pending windows and ignores later ticks', () => {
    const { timers, published, instance } = open();
    instance.push(tick('BTCUSDT', 1));
    expect(timers.pendingCount()).toBe(1);
    instance.close();
    expect(timers.pendingCount()).toBe(0);
    timers.advance(INTERVAL * 3);
    instance.push(tick('BTCUSDT', 2));
    timers.advance(INTERVAL * 3);
    expect(published).toStrictEqual([]);
    expect(timers.pendingCount()).toBe(0);
  });

  test('a publisher that throws does not stop the next windows', () => {
    const timers = createManualTimers();
    const seen: number[] = [];
    const instance = aggregator.createTickAggregator({
      intervalMilliseconds: INTERVAL,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      publish: (aggregated) => {
        seen.push(aggregated.eventTime);
        if (aggregated.eventTime === 1) throw new Error('consumidor quebrado');
      },
    });
    instance.push(tick('BTCUSDT', 1));
    expect(() => timers.advance(INTERVAL)).not.toThrow();
    instance.push(tick('BTCUSDT', 2));
    timers.advance(INTERVAL);
    expect(seen).toStrictEqual([1, 2]);
  });
});
