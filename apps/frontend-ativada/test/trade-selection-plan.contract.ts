// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { centerRangeOn, planTradeSelection } from '../src/runs/trade-selection.js';

const DAY = 86_400_000;
const EXTENT = { from: 0, to: 100 * DAY };
const WEEK = { from: 80 * DAY, to: 87 * DAY };
const TRADE = { engineKey: 'p1', openedCandleTime: 10 * DAY, closedCandleTime: 12 * DAY };

describe('centerRangeOn', () => {
  test('keeps the width and centers on the middle of the trade', () => {
    expect(centerRangeOn({ trade: TRADE, range: WEEK, extent: EXTENT })).toEqual({
      from: 11 * DAY - 3.5 * DAY,
      to: 11 * DAY + 3.5 * DAY,
    });
  });

  test('stops at the start of the run without shrinking', () => {
    const early = { engineKey: 'p0', openedCandleTime: 1 * DAY, closedCandleTime: 2 * DAY };
    expect(centerRangeOn({ trade: early, range: WEEK, extent: EXTENT })).toEqual({
      from: 0,
      to: 7 * DAY,
    });
  });

  test('stops at the end of the run without shrinking', () => {
    const late = { engineKey: 'p9', openedCandleTime: 99 * DAY, closedCandleTime: 99.5 * DAY };
    expect(centerRangeOn({ trade: late, range: WEEK, extent: EXTENT })).toEqual({
      from: 93 * DAY,
      to: 100 * DAY,
    });
  });

  test('a trade longer than the range is centered on its purchase', () => {
    const long = { engineKey: 'p2', openedCandleTime: 20 * DAY, closedCandleTime: 60 * DAY };
    expect(centerRangeOn({ trade: long, range: WEEK, extent: EXTENT })).toEqual({
      from: 20 * DAY - 3.5 * DAY,
      to: 20 * DAY + 3.5 * DAY,
    });
  });

  test('an open trade is centered on its purchase', () => {
    const open = { engineKey: 'o1', openedCandleTime: 30 * DAY };
    expect(centerRangeOn({ trade: open, range: WEEK, extent: undefined })).toEqual({
      from: 30 * DAY - 3.5 * DAY,
      to: 30 * DAY + 3.5 * DAY,
    });
  });

  test('the width is kept to the millisecond for any trade and range', () => {
    for (let index = 0; index < 500; index += 1) {
      const width = 1 + ((index * 7_919) % (30 * DAY));
      const opened = (index * 104_729) % (100 * DAY);
      const range = { from: 5 * DAY, to: 5 * DAY + width };
      const trade = { engineKey: 'k', openedCandleTime: opened, closedCandleTime: opened + index };
      const centered = centerRangeOn({ trade, range, extent: EXTENT });
      expect(centered.to - centered.from).toBe(width);
      expect(centered.from).toBeGreaterThanOrEqual(0);
      expect(centered.to).toBeLessThanOrEqual(Math.max(100 * DAY, width));
    }
  });
});

describe('planTradeSelection', () => {
  test('without a range in the URL it selects and leaves the range alone', () => {
    expect(planTradeSelection({ trade: TRADE, range: undefined, extent: EXTENT })).toEqual({
      key: 'p1',
      range: undefined,
    });
  });

  test('with a range it selects and moves the range to the trade, even when it is outside', () => {
    expect(planTradeSelection({ trade: TRADE, range: WEEK, extent: EXTENT })).toEqual({
      key: 'p1',
      range: { from: 7.5 * DAY, to: 14.5 * DAY },
    });
  });
});
