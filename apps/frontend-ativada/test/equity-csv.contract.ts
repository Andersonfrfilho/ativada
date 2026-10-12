// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { downsample, parseEquityCsv } from '../src/runs/equity-csv.js';
import { buildEquityCsv } from './support/run-fixtures.js';

describe('equity CSV', () => {
  test('reads the API export columns as numbers', () => {
    const points = parseEquityCsv(buildEquityCsv(3));
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      time: Date.parse('2026-01-01T00:00:00.000Z'),
      equity: 10_000,
      benchmark: 10_000,
    });
    expect(points[2]?.equity).toBeCloseTo(10_420, 5);
    expect(points[2]?.benchmark).toBeCloseTo(10_110, 5);
  });

  test('refuses a file that is not the equity export', () => {
    expect(() => parseEquityCsv('a,b\n1,2')).toThrow();
    expect(() => parseEquityCsv('candle_time,equity,equity_at_low,benchmark\n1,x,3,4')).toThrow();
    expect(() => parseEquityCsv('candle_time,equity,equity_at_low,benchmark\n1,2,3')).toThrow();
  });

  test('downsampling keeps the first and last point and the order, and never grows the series', () => {
    const points = parseEquityCsv(buildEquityCsv(1000));
    const sampled = downsample(points, 50);
    expect(sampled).toHaveLength(50);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
    expect(sampled.map((point) => point.time)).toEqual(
      [...sampled.map((point) => point.time)].sort((a, b) => a - b),
    );
    expect(downsample(points.slice(0, 10), 50)).toHaveLength(10);
  });
});
