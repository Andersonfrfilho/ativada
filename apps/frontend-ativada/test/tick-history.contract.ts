// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { TickHistory } from '../src/live/tick-history.js';

describe('tick history', () => {
  test('returns the latest tick at or before the limit, and nothing when the history starts later', () => {
    const history = new TickHistory();
    history.record('BTCUSDT', { time: 1_000, price: '1' });
    history.record('BTCUSDT', { time: 2_000, price: '2' });
    history.record('BTCUSDT', { time: 3_000, price: '3' });
    expect(history.atOrBefore('BTCUSDT', 2_500)?.price).toBe('2');
    expect(history.atOrBefore('BTCUSDT', 3_000)?.price).toBe('3');
    expect(history.atOrBefore('BTCUSDT', 999)).toBeUndefined();
    expect(history.atOrBefore('ETHUSDT', 5_000)).toBeUndefined();
  });

  test('drops ticks older than the cap, keeping the pairs apart', () => {
    const history = new TickHistory(10_000);
    history.record('BTCUSDT', { time: 0, price: '1' });
    history.record('ETHUSDT', { time: 0, price: '9' });
    history.record('BTCUSDT', { time: 5_000, price: '2' });
    history.record('BTCUSDT', { time: 12_000, price: '3' });
    expect(history.atOrBefore('BTCUSDT', 1_000)).toBeUndefined();
    expect(history.atOrBefore('BTCUSDT', 6_000)?.price).toBe('2');
    expect(history.atOrBefore('ETHUSDT', 1_000)?.price).toBe('9');
  });

  test('clear forgets everything', () => {
    const history = new TickHistory();
    history.record('BTCUSDT', { time: 1, price: '1' });
    history.clear();
    expect(history.atOrBefore('BTCUSDT', 10)).toBeUndefined();
  });
});
