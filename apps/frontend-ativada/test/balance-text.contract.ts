// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { describeBalanceSteps, findBalanceExtremes } from '../src/overview/balance-axis.js';
import { describeCandle, formatRunningFor } from '../src/overview/running-for.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('formatRunningFor', () => {
  test('counts in minutes, hours and days without seconds', () => {
    expect(formatRunningFor(20_000)).toBe('menos de 1 min');
    expect(formatRunningFor(35 * MINUTE)).toBe('35 min');
    expect(formatRunningFor(16 * HOUR + 10 * MINUTE)).toBe('16 h');
    expect(formatRunningFor(72 * HOUR)).toBe('3 dias');
  });

  test('never goes negative when the clock is behind the start', () => {
    expect(formatRunningFor(-5 * MINUTE)).toBe('menos de 1 min');
  });
});

describe('balance chart text', () => {
  test('names the candle and the chart steps in words', () => {
    expect(describeCandle('15m')).toBe('vela de 15 min');
    expect(describeBalanceSteps('1h')).toBe('hora a hora');
    expect(describeBalanceSteps('15m')).toBe('a cada 15 min');
  });

  test('finds the largest and smallest value between the curve and buy and hold', () => {
    const points = [
      { candleTime: 1, equity: '10000.00', equityAtLow: '10000.00', benchmark: '9886.47' },
      { candleTime: 2, equity: '10010.50', equityAtLow: '10000.00', benchmark: '9950.00' },
    ];
    expect(findBalanceExtremes(points)).toEqual({ maxText: '10010.50', minText: '9886.47' });
    expect(findBalanceExtremes([])).toBeUndefined();
  });
});
