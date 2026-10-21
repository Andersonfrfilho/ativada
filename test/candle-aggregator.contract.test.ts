// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RawCandle } from '../packages/market-data-crypto/src/ticker/ticker.types.js';
import { createManualTimers } from './fixtures/ticker/manual-timers.fixture.js';
import { loadTickerApi } from './fixtures/ticker/ticker-source.fixture.js';

const { candleAggregator, candleSchema } = await loadTickerApi();
const INTERVAL = 1_000;

function candle(symbol: string, timeframe: RawCandle['timeframe'], eventTime: number): RawCandle {
  return {
    symbol,
    timeframe,
    openTime: 1_760_000_000_000,
    open: '100.00',
    high: '110.00',
    low: '95.00',
    close: `${100 + eventTime}.00`,
    volume: '12.50',
    isClosed: false,
    eventTime,
  };
}

function open(): {
  readonly timers: ReturnType<typeof createManualTimers>;
  readonly published: RawCandle[];
  readonly instance: ReturnType<typeof candleAggregator.createCandleAggregator>;
} {
  const timers = createManualTimers();
  const published: RawCandle[] = [];
  const instance = candleAggregator.createCandleAggregator({
    intervalMilliseconds: INTERVAL,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    publish: (item) => void published.push(item),
  });
  return { timers, published, instance };
}

describe('candle aggregator — at most one publication per second per (pair, candle size)', () => {
  test('50 events in one second become ONE publication: the last', () => {
    const { timers, published, instance } = open();
    for (let index = 1; index <= 50; index += 1) {
      instance.push(candle('BTCUSDT', '1h', index));
      timers.advance(15);
    }
    timers.advance(INTERVAL);
    expect(published).toStrictEqual([candle('BTCUSDT', '1h', 50)]);
  });

  test('each (pair, candle size) has its own window', () => {
    const { timers, published, instance } = open();
    instance.push(candle('BTCUSDT', '1h', 1));
    instance.push(candle('BTCUSDT', '4h', 2));
    instance.push(candle('ETHUSDT', '1h', 3));
    timers.advance(INTERVAL);
    expect(published.map((item) => `${item.symbol}:${item.timeframe}`).sort()).toStrictEqual([
      'BTCUSDT:1h',
      'BTCUSDT:4h',
      'ETHUSDT:1h',
    ]);
  });

  test('nothing is published before the window closes; a redelivered or older event is ignored', () => {
    const { timers, published, instance } = open();
    instance.push(candle('BTCUSDT', '1h', 5));
    timers.advance(INTERVAL - 1);
    expect(published).toStrictEqual([]);
    timers.advance(1);
    expect(published).toHaveLength(1);
    instance.push(candle('BTCUSDT', '1h', 5));
    instance.push(candle('BTCUSDT', '1h', 4));
    timers.advance(INTERVAL * 2);
    expect(published).toHaveLength(1);
  });

  test('a closed aggregator accepts nothing and clears the timers', () => {
    const { timers, published, instance } = open();
    instance.push(candle('BTCUSDT', '1h', 1));
    instance.close();
    timers.advance(INTERVAL * 2);
    instance.push(candle('BTCUSDT', '1h', 2));
    timers.advance(INTERVAL * 2);
    expect(published).toStrictEqual([]);
  });

  test('a failing publisher is reported, never thrown', () => {
    const timers = createManualTimers();
    const errors: unknown[] = [];
    const instance = candleAggregator.createCandleAggregator({
      intervalMilliseconds: INTERVAL,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      publish: () => {
        throw new Error('falhou');
      },
      reportError: (error) => void errors.push(error),
    });
    instance.push(candle('BTCUSDT', '1h', 1));
    timers.advance(INTERVAL);
    expect(errors).toHaveLength(1);
  });
});

describe('kline message parsing (the forming candle)', () => {
  const valid = {
    stream: 'btcusdt@kline_1h',
    data: {
      e: 'kline',
      E: 1_760_000_000_500,
      s: 'BTCUSDT',
      k: {
        t: 1_760_000_000_000,
        s: 'BTCUSDT',
        i: '1h',
        o: '100.10',
        h: '110.20',
        l: '95.30',
        c: '105.40',
        v: '12.50',
        x: false,
      },
    },
  };

  test('reads the open candle with prices and volume as decimal text', () => {
    expect(candleSchema.parseCandleEnvelope(valid)).toStrictEqual({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: 1_760_000_000_000,
      open: '100.10',
      high: '110.20',
      low: '95.30',
      close: '105.40',
      volume: '12.50',
      isClosed: false,
      eventTime: 1_760_000_000_500,
    });
  });

  test('the closed flag is carried', () => {
    const closed = { ...valid, data: { ...valid.data, k: { ...valid.data.k, x: true } } };
    expect(candleSchema.parseCandleEnvelope(closed)?.isClosed).toBe(true);
  });

  test.each([
    ['another event type', { ...valid, data: { ...valid.data, e: '24hrMiniTicker' } }],
    ['a stream name that disagrees with the pair', { ...valid, stream: 'ethusdt@kline_1h' }],
    ['a stream name that disagrees with the candle size', { ...valid, stream: 'btcusdt@kline_4h' }],
    [
      'a price that is a number',
      { ...valid, data: { ...valid.data, k: { ...valid.data.k, c: 105.4 } } },
    ],
    [
      'an unknown candle size',
      { ...valid, data: { ...valid.data, k: { ...valid.data.k, i: '3m' } } },
    ],
    [
      'a pair that disagrees inside the payload',
      { ...valid, data: { ...valid.data, s: 'ETHUSDT' } },
    ],
  ])('discards %s', (_name, value) => {
    expect(candleSchema.parseCandleEnvelope(value)).toBeUndefined();
  });
});
