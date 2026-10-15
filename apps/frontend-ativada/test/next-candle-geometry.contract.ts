// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { CONE_STEPS } from '../src/runs/candle-chart/candle-chart.constant.js';
import {
  marketCandleSchema,
  type MarketCandle,
} from '../src/runs/candle-chart/market-candles.validation.js';
import { buildPanelModel } from '../src/runs/candle-chart/next-candle-geometry.js';
import {
  PANEL_AXIS_WIDTH,
  PANEL_WIDTH,
  type PanelInput,
} from '../src/runs/candle-chart/next-candle-model.js';
import {
  projectionsSchema,
  type AvailableProjection,
} from '../src/runs/candle-chart/projections.validation.js';
import {
  buildMarketCandle,
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

const WINDOW = {
  start: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
  end: FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS,
};
const RIGHT = PANEL_WIDTH - PANEL_AXIS_WIDTH;

function recent(count: number): MarketCandle[] {
  return Array.from({ length: count }, (_unused, index) =>
    marketCandleSchema.parse(
      buildMarketCandle(index, {
        open: '12.90000000',
        close: index % 2 === 0 ? '12.95000000' : '12.85000000',
      }),
    ),
  );
}

function projectionOf(overrides: Record<string, unknown> = {}): AvailableProjection {
  const current = Object.assign({}, buildProjectionsResponse()['current'], overrides);
  const parsed = projectionsSchema.parse(buildProjectionsResponse({ current })).current;
  if (parsed.status !== 'available') throw new Error('fixture sem tendência');
  return parsed;
}

function input(overrides: Partial<PanelInput> = {}): PanelInput {
  return {
    recent: recent(5),
    forming: undefined,
    trail: [],
    window: WINDOW,
    projection: projectionOf(),
    ...overrides,
  };
}

function lastPoint(polygon: string): readonly number[] {
  return (polygon.split(' ').at(-1) ?? '').split(',').map((part) => Number.parseFloat(part));
}

describe('geometria do painel da próxima vela', () => {
  test('five recent candles fill the left zone in time order, rising ones marked up', () => {
    const model = buildPanelModel(input());
    expect(model.past).toHaveLength(5);
    const xs = model.past.map((candle) => candle.x);
    expect([...xs].sort((a, b) => a - b)).toStrictEqual(xs);
    expect(model.past.map((candle) => candle.isUp)).toStrictEqual([true, false, true, false, true]);
    expect(model.past.every((candle) => candle.wickTop < candle.wickBottom)).toBe(true);
    expect(xs.at(-1)).toBeLessThan(model.split);
  });

  test('fewer candles keep their slots, aligned to the divider', () => {
    const full = buildPanelModel(input());
    const two = buildPanelModel(input({ recent: recent(2) }));
    expect(two.past).toHaveLength(2);
    expect(two.past.at(-1)?.x).toBe(full.past.at(-1)?.x);
  });

  test('a buy trend colors the upper half: the shape closes on the flat base line', () => {
    const model = buildPanelModel(input());
    const cone = model.cone;
    expect(cone?.side).toBe('buy');
    expect(model.baseY).toBeDefined();
    expect(cone?.highY).toBeLessThan(model.baseY ?? 0);
    expect(model.baseY).toBeLessThan(cone?.lowY ?? 0);
    expect(cone?.neutral.split(' ')).toHaveLength(2 * (CONE_STEPS + 1));
    const closing = cone?.trend.split(' ').slice(-2) ?? [];
    expect(closing).toStrictEqual([`${RIGHT},${model.baseY}`, `${model.split},${model.baseY}`]);
    const topEdge = cone?.trend.split(' ').at(CONE_STEPS)?.split(',').map(Number.parseFloat) ?? [];
    expect(topEdge[1]).toBe(cone?.highY);
  });

  test('a sell trend colors the lower half', () => {
    const model = buildPanelModel(
      input({ projection: projectionOf({ side: 'sell', stance: 'sell' }) }),
    );
    expect(model.cone?.side).toBe('sell');
    const bottomEdge =
      model.cone?.trend.split(' ').at(CONE_STEPS)?.split(',').map(Number.parseFloat) ?? [];
    expect(bottomEdge[1]).toBe(model.cone?.lowY);
  });

  test('without a trend there is no cone, only the candles', () => {
    const model = buildPanelModel(input({ projection: undefined }));
    expect(model.cone).toBeUndefined();
    expect(model.past).toHaveLength(5);
    expect(model.baseY).toBeDefined();
  });

  test('a trend without a band has no cone either', () => {
    const model = buildPanelModel(
      input({ projection: projectionOf({ bandLow: null, bandHigh: null }) }),
    );
    expect(model.cone).toBeUndefined();
  });

  test('the real line starts on the base price, grows with time and stops at the right edge', () => {
    const forming = recent(1)[0];
    const trail = [
      { at: WINDOW.start, close: '12.90000000' },
      { at: WINDOW.start + HOUR_MILLISECONDS / 2, close: '12.96000000' },
      { at: WINDOW.end + 5 * HOUR_MILLISECONDS, close: '13.00000000' },
    ];
    const model = buildPanelModel(input({ forming, trail }));
    expect(model.trail).toBeDefined();
    const points = (model.trail ?? '')
      .split(' ')
      .map((pair) => pair.split(',').map(Number.parseFloat));
    expect(points[0]?.[0]).toBe(model.split);
    expect(points.at(-1)?.[0]).toBe(RIGHT);
    expect(points[2]?.[0]).toBeCloseTo((model.split + RIGHT) / 2, 1);
    expect(points[2]?.[1]).toBeLessThan(points[1]?.[1] ?? 0);
    expect(model.now?.x).toBe(RIGHT);
    expect(model.now?.y).toBe(lastPoint(model.trail ?? '')[1]);
    expect(model.forming?.x).toBe(model.split);
    expect(model.forming?.width).toBeCloseTo(RIGHT - model.split, 6);
  });

  test('without messages there is no real line, no marker and no enlarged candle', () => {
    const model = buildPanelModel(input({ forming: recent(1)[0] }));
    expect(model.trail).toBeUndefined();
    expect(model.now).toBeUndefined();
    expect(model.forming).toBeUndefined();
  });

  test('with nothing to draw the model is empty', () => {
    const model = buildPanelModel(input({ recent: [], projection: undefined }));
    expect(model.past).toStrictEqual([]);
    expect(model.cone).toBeUndefined();
    expect(model.baseY).toBeUndefined();
  });
});
