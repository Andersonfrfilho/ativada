// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeLastBarsWidth } from '../src/runs/candle-chart/visible-bars.js';

describe('computeLastBarsWidth', () => {
  test('with few candles the window shrinks to them plus the right margin', () => {
    expect(computeLastBarsWidth({ candleCount: 30, bars: 150, rightMarginBars: 6 })).toBe(36);
  });

  test('with many candles it keeps the usual opening width', () => {
    expect(computeLastBarsWidth({ candleCount: 800, bars: 150, rightMarginBars: 6 })).toBe(150);
  });
});
