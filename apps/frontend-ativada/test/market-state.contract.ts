// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeMarketState, isPriceFresh, MarketStore } from '../src/live/market-store.js';
import type { MarketTick } from '../src/live/stream-client.js';

function tick(overrides: Partial<MarketTick> = {}): MarketTick {
  return {
    symbol: 'BTCUSDT',
    price: '61000.00',
    change24h: '1.2345',
    at: 1,
    isStale: false,
    ...overrides,
  };
}

describe('market store', () => {
  test('keeps the latest price per pair, with the change as a ratio and the local arrival time', () => {
    let clock = 1_000;
    const store = new MarketStore(() => clock);
    store.applyTick(tick());
    clock = 2_000;
    store.applyTick(tick({ symbol: 'ETHUSDT', price: '3000.10', change24h: null }));
    clock = 3_000;
    store.applyTick(tick({ price: '61010.00', change24h: '-0.5' }));
    const prices = store.getSnapshot();
    expect(prices.get('BTCUSDT')).toEqual({
      price: '61010.00',
      change24h: -0.005,
      receivedAt: 3_000,
      isStale: false,
    });
    expect(prices.get('ETHUSDT')?.change24h).toBeUndefined();
  });

  test('notifies subscribers on each tick and hands out a new snapshot, so React sees the change', () => {
    const store = new MarketStore(() => 0);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => void (notifications += 1));
    const before = store.getSnapshot();
    store.applyTick(tick());
    expect(store.getSnapshot()).not.toBe(before);
    unsubscribe();
    store.applyTick(tick({ price: '62000.00' }));
    expect(notifications).toBe(1);
  });

  test('a fresh tick clears the stale seal and a stale one sets it', () => {
    const store = new MarketStore(() => 0);
    store.applyTick(tick({ isStale: true }));
    expect(store.getSnapshot().get('BTCUSDT')?.isStale).toBe(true);
    store.applyTick(tick());
    expect(store.getSnapshot().get('BTCUSDT')?.isStale).toBe(false);
  });

  test('forgetting everything (new session) empties the store', () => {
    const store = new MarketStore(() => 0);
    store.applyTick(tick());
    store.clear();
    expect(store.getSnapshot().size).toBe(0);
  });
});

describe('market state', () => {
  const prices = (receivedAt: number, isStale = false): ReadonlyMap<string, never> =>
    new Map([['BTCUSDT', { price: '1', change24h: undefined, receivedAt, isStale } as never]]);

  test('is live while ticks keep arriving over a live socket', () => {
    expect(
      computeMarketState({ streamStatus: 'live', prices: prices(9_000), now: 12_000 }),
    ).toEqual({
      state: 'live',
      secondsWithoutData: 3,
    });
  });

  test('waits for the first prices before saying anything about them', () => {
    expect(computeMarketState({ streamStatus: 'live', prices: new Map(), now: 5_000 })).toEqual({
      state: 'waiting',
      secondsWithoutData: undefined,
    });
  });

  test('turns stale after 10 s without any tick, counting the seconds', () => {
    expect(computeMarketState({ streamStatus: 'live', prices: prices(0), now: 10_000 }).state).toBe(
      'live',
    );
    expect(computeMarketState({ streamStatus: 'live', prices: prices(0), now: 10_001 })).toEqual({
      state: 'stale',
      secondsWithoutData: 10,
    });
  });

  test('turns stale at once when the server seals every pair as stale', () => {
    expect(
      computeMarketState({ streamStatus: 'live', prices: prices(9_900, true), now: 10_000 }),
    ).toEqual({ state: 'stale', secondsWithoutData: 0 });
  });

  test('is offline, still counting from the last price, when the socket is not live', () => {
    for (const streamStatus of ['connecting', 'reconnecting', 'stopped', 'blocked'] as const) {
      expect(computeMarketState({ streamStatus, prices: prices(4_000), now: 9_000 })).toEqual({
        state: 'offline',
        secondsWithoutData: 5,
      });
    }
    expect(
      computeMarketState({ streamStatus: 'reconnecting', prices: new Map(), now: 9_000 }),
    ).toEqual({
      state: 'offline',
      secondsWithoutData: undefined,
    });
  });
});

describe('freshness of one pair', () => {
  const price = { price: '1', change24h: undefined, receivedAt: 1_000, isStale: false };

  test('fresh while the last tick is inside the silence window and not sealed', () => {
    expect(isPriceFresh({ price, now: 1_000 + 10_000, silenceMilliseconds: 10_000 })).toBe(true);
  });

  test('silent once the window passes, even if other pairs keep ticking', () => {
    expect(isPriceFresh({ price, now: 1_000 + 10_001, silenceMilliseconds: 10_000 })).toBe(false);
  });

  test('sealed by the server is never fresh', () => {
    expect(
      isPriceFresh({ price: { ...price, isStale: true }, now: 1_000, silenceMilliseconds: 10_000 }),
    ).toBe(false);
  });

  test('the seconds without data never go negative when the clocks disagree', () => {
    const prices = new Map([['BTCUSDT', { ...price, receivedAt: 5_000 }]]);
    const status = computeMarketState({ streamStatus: 'live', prices, now: 1_000 });
    expect(status.secondsWithoutData).toBe(0);
  });
});
