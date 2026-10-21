// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { CandleStore, candleKey } from '../src/live/candle-store.js';
import { judgeLiveCandle } from '../src/live/live-candle.js';
import { MarketStore } from '../src/live/market-store.js';
import { STREAM_STATUS } from '../src/live/stream.constant.js';
import type { StreamCandle } from '../src/live/stream.validation.js';

function candle(overrides: Partial<StreamCandle> = {}): StreamCandle {
  return {
    type: 'candle',
    symbol: 'LINKUSDT',
    timeframe: '1h',
    openTime: 1_000,
    open: '12.93',
    high: '12.985',
    low: '12.872',
    close: '12.905',
    volume: '23900.5',
    closed: false,
    at: 5_000,
    ...overrides,
  };
}

describe('CandleStore: só a vela aberta de cada par e vela', () => {
  test('keeps the latest open candle per pair and candle size, with the browser clock', () => {
    let clock = 100;
    const store = new CandleStore(() => clock);
    store.apply(candle());
    clock = 250;
    store.apply(candle({ close: '13', at: 6_000 }));
    store.apply(candle({ timeframe: '4h' }));
    store.apply(candle({ symbol: 'BTCUSDT' }));
    const snapshot = store.getSnapshot();
    expect(snapshot.size).toBe(3);
    expect(snapshot.get(candleKey('LINKUSDT', '1h'))).toEqual({
      candle: candle({ close: '13', at: 6_000 }),
      receivedAt: 250,
    });
  });

  test('the reading of one key keeps the same reference while only other pairs and candles change', () => {
    const store = new CandleStore(() => 1);
    store.apply(candle());
    const key = candleKey('LINKUSDT', '1h');
    const before = store.candleAt(key);
    store.apply(candle({ symbol: 'BTCUSDT', close: '99', at: 6_000 }));
    store.apply(candle({ timeframe: '4h', close: '98', at: 6_001 }));
    expect(store.candleAt(key)).toBe(before);
    store.apply(candle({ close: '13', at: 7_000 }));
    expect(store.candleAt(key)).not.toBe(before);
    expect(store.candleAt(candleKey('NOPE', '1h'))).toBeUndefined();
  });

  test('a late message of an older candle, or an older message of the same one, does not undo the current', () => {
    const store = new CandleStore(() => 1);
    store.apply(candle({ openTime: 2_000, close: '14', at: 9_000 }));
    store.apply(candle({ openTime: 1_000, close: '10', at: 10_000 }));
    store.apply(candle({ openTime: 2_000, close: '11', at: 8_000 }));
    expect(store.getSnapshot().get(candleKey('LINKUSDT', '1h'))?.candle.close).toBe('14');
    store.apply(candle({ openTime: 3_000, close: '15', at: 11_000 }));
    expect(store.getSnapshot().get(candleKey('LINKUSDT', '1h'))?.candle.openTime).toBe(3_000);
  });

  test('a closed message removes the open candle (the closed one arrives by REST), and only that pair', () => {
    const store = new CandleStore(() => 1);
    store.apply(candle());
    store.apply(candle({ symbol: 'BTCUSDT' }));
    store.apply(candle({ closed: true, at: 6_000 }));
    expect(store.getSnapshot().has(candleKey('LINKUSDT', '1h'))).toBe(false);
    expect(store.getSnapshot().has(candleKey('BTCUSDT', '1h'))).toBe(true);
  });

  test('tells the listeners, only the candle ones, and the market store clears both', () => {
    const market = new MarketStore(() => 1);
    let candleCalls = 0;
    let priceCalls = 0;
    market.candles.subscribe(() => (candleCalls += 1));
    market.subscribe(() => (priceCalls += 1));
    market.candles.apply(candle());
    expect(candleCalls).toBe(1);
    expect(priceCalls).toBe(0);
    market.clear();
    expect(market.candles.getSnapshot().size).toBe(0);
  });
});

describe('judgeLiveCandle: forma ou sem dados', () => {
  const stored = { candle: candle(), receivedAt: 1_000 };
  const base = {
    stored,
    tick: undefined,
    streamStatus: STREAM_STATUS.LIVE,
    silenceMilliseconds: 10_000,
  };

  test('an up-to-date candle on a live socket is forming', () => {
    expect(judgeLiveCandle({ ...base, now: 11_000 })).toEqual({
      status: 'forming',
      candle: stored.candle,
    });
  });

  test('past the silence limit, or off the air, the candle goes and the seconds are counted', () => {
    expect(judgeLiveCandle({ ...base, now: 12_500 })).toEqual({
      status: 'no_data',
      secondsWithoutData: 11,
    });
    expect(
      judgeLiveCandle({ ...base, streamStatus: STREAM_STATUS.RECONNECTING, now: 2_000 }),
    ).toEqual({
      status: 'no_data',
      secondsWithoutData: 1,
    });
  });

  test('without a known candle and without a tick there is nothing to say', () => {
    expect(judgeLiveCandle({ ...base, stored: undefined, now: 1 })).toBeUndefined();
  });

  test('without a candle (no kline) the tick tells whether the price stopped', () => {
    const tick = { price: '12.5', change24h: undefined, receivedAt: 1_000, isStale: false };
    const noCandle = { ...base, stored: undefined, tick };
    expect(judgeLiveCandle({ ...noCandle, now: 11_000 })).toBeUndefined();
    expect(judgeLiveCandle({ ...noCandle, now: 12_500 })).toEqual({
      status: 'no_data',
      secondsWithoutData: 11,
    });
    expect(
      judgeLiveCandle({ ...noCandle, streamStatus: STREAM_STATUS.RECONNECTING, now: 2_000 }),
    ).toEqual({ status: 'no_data', secondsWithoutData: 1 });
    expect(judgeLiveCandle({ ...noCandle, tick: { ...tick, isStale: true }, now: 2_000 })).toEqual({
      status: 'no_data',
      secondsWithoutData: 1,
    });
  });
});
