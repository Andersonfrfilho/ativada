// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SurfaceProjection } from '../src/runs/candle-chart/chart-surface.types.js';
import {
  projectionsSchema,
  type ProjectionCurrent,
} from '../src/runs/candle-chart/projections.validation.js';
import {
  buildProjectionCone,
  toSurfaceProjection,
} from '../src/runs/candle-chart/projection-cone.js';
import {
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

function currentOf(overrides: Record<string, unknown> = {}): ProjectionCurrent {
  const current = Object.assign({}, buildProjectionsResponse()['current'], overrides);
  return projectionsSchema.parse(buildProjectionsResponse({ current })).current;
}

const BUY_PROJECTION: SurfaceProjection = {
  startTime: 1_000,
  endTime: 4_600,
  base: 100,
  low: 98,
  high: 103,
  side: 'buy',
};

describe('projection cone', () => {
  test('the surface projection carries the band and the trend side, in seconds', () => {
    expect(toSurfaceProjection(currentOf())).toStrictEqual({
      startTime: (FIRST_CANDLE_TIME + HOUR_MILLISECONDS) / 1_000,
      endTime: (FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS) / 1_000,
      base: 12.905,
      low: 12.778,
      high: 13.032,
      side: 'buy',
    });
    expect(toSurfaceProjection(currentOf({ side: 'sell', stance: 'stay_out' }))?.side).toBe('sell');
  });

  test('without a trend or without a band there is no cone', () => {
    const unavailable = { status: 'unavailable', reason: 'neutral', message: 'Placar em 0.' };
    const parsed = projectionsSchema.parse(buildProjectionsResponse({ current: unavailable }));
    expect(toSurfaceProjection(parsed.current)).toBeNull();
    expect(toSurfaceProjection(currentOf({ bandLow: null }))).toBeNull();
    expect(toSurfaceProjection(currentOf({ bandHigh: null }))).toBeNull();
  });

  test('the band opens with the square root of the fraction, from the base to the full band', () => {
    const cone = buildProjectionCone(BUY_PROJECTION, 4);
    expect(cone.points.map((point) => point.fraction)).toStrictEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(cone.points[0]).toStrictEqual({ fraction: 0, upper: 100, lower: 100 });
    expect(cone.points[1]?.upper).toBeCloseTo(101.5, 10);
    expect(cone.points[1]?.lower).toBeCloseTo(99, 10);
    expect(cone.points[4]).toStrictEqual({ fraction: 1, upper: 103, lower: 98 });
  });

  test('the band never shrinks and never leaves the recorded band (no target price)', () => {
    const cone = buildProjectionCone(BUY_PROJECTION, 12);
    expect(cone.points).toHaveLength(13);
    cone.points.forEach((point, index) => {
      const previous = cone.points[index - 1];
      expect(point.upper).toBeLessThanOrEqual(BUY_PROJECTION.high);
      expect(point.lower).toBeGreaterThanOrEqual(BUY_PROJECTION.low);
      if (previous === undefined) return;
      expect(point.upper).toBeGreaterThanOrEqual(previous.upper);
      expect(point.lower).toBeLessThanOrEqual(previous.lower);
    });
  });

  test('the colored half is the one on the trend side', () => {
    expect(buildProjectionCone(BUY_PROJECTION, 4).trendHalf).toBe('upper');
    expect(buildProjectionCone({ ...BUY_PROJECTION, side: 'sell' }, 4).trendHalf).toBe('lower');
    expect(buildProjectionCone(BUY_PROJECTION, 4).base).toBe(100);
  });
});
