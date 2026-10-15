// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  isRisingCandle,
  toDrawingNumber,
  toSurfaceCandles,
  toSurfaceTime,
  toVolumeBars,
} from '../src/runs/candle-chart/candle-series.js';
import { toSurfaceMarkers } from '../src/runs/candle-chart/marker-series.js';
import {
  marketCandleSchema,
  type MarketCandle,
} from '../src/runs/candle-chart/market-candles.validation.js';
import { toScoreBars, toThresholdSegments } from '../src/runs/candle-chart/score-series.js';
import { toSurfaceLines } from '../src/runs/candle-chart/strategy-line-series.js';
import {
  strategyLayersSchema,
  type StrategyLayers,
} from '../src/runs/candle-chart/strategy-layers.validation.js';
import {
  buildLayersResponse,
  buildMarketCandle,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

const FIRST_SECOND = FIRST_CANDLE_TIME / 1_000;

function candle(index: number, overrides: Record<string, unknown> = {}): MarketCandle {
  return marketCandleSchema.parse(buildMarketCandle(index, overrides));
}

function layers(overrides: Record<string, unknown> = {}): StrategyLayers {
  return strategyLayersSchema.parse(buildLayersResponse(overrides));
}

describe('candle series', () => {
  test('turns exact text into drawing numbers and milliseconds into UTC seconds', () => {
    expect(toDrawingNumber('12.90500000')).toBe(12.905);
    expect(toDrawingNumber('-1.5')).toBe(-1.5);
    expect(toSurfaceTime(FIRST_CANDLE_TIME + 999)).toBe(FIRST_SECOND);
  });

  test('maps each candle to open, high, low and close at its open time', () => {
    expect(toSurfaceCandles([candle(0), candle(1)])).toStrictEqual([
      { time: FIRST_SECOND, open: 12.93, high: 12.985, low: 12.872, close: 12.905 },
      { time: FIRST_SECOND + 3_600, open: 12.93, high: 12.985, low: 12.872, close: 12.905 },
    ]);
  });

  test('volume bars follow the candle color, comparing the exact values', () => {
    expect(isRisingCandle(candle(0))).toBe(false);
    expect(isRisingCandle(candle(0, { close: '12.93500000' }))).toBe(true);
    expect(isRisingCandle({ open: '0.1', close: '0.10000000' })).toBe(true);
    expect(isRisingCandle({ open: '10.2', close: '10.19999999' })).toBe(false);
    expect(toVolumeBars([candle(0), candle(1, { close: '13' })])).toStrictEqual([
      { time: FIRST_SECOND, value: 23_900.5, isUp: false },
      { time: FIRST_SECOND + 3_600, value: 23_900.5, isUp: true },
    ]);
  });

  test('there is no other text-to-number conversion in the chart code', () => {
    const directory = new URL('../src/runs/candle-chart/', import.meta.url);
    const others = readdirSync(directory).filter(
      (name) => name.endsWith('.ts') && name !== 'candle-series.ts',
    );
    expect(others.length).toBeGreaterThan(5);
    for (const name of others) {
      const source = readFileSync(new URL(name, directory), 'utf8');
      expect(source, name).not.toMatch(/\b(Number|parseFloat|parseInt)\s*\(|Number\.parse/);
    }
  });
});

describe('strategy line series', () => {
  test('a null value (warm-up) leaves a gap, never a zero', () => {
    expect(toSurfaceLines(layers())).toStrictEqual([
      {
        key: 'rule:donchian.upper',
        role: 'channel_upper',
        points: [
          { time: FIRST_SECOND, value: 13.1 },
          { time: FIRST_SECOND + 7_200, value: 13.2 },
        ],
      },
    ]);
  });

  test('a strategy without price lines draws none, and an all-null line keeps its key', () => {
    expect(toSurfaceLines(layers({ lines: [] }))).toStrictEqual([]);
    const empty = [
      { key: 'k', ruleId: 'r', role: 'ema_fast', label: 'L', values: [null, null, null] },
    ];
    expect(toSurfaceLines(layers({ lines: empty }))).toStrictEqual([
      { key: 'k', role: 'ema_fast', points: [] },
    ]);
  });
});

describe('score series', () => {
  test('one bar per decided candle with the recorded score and action', () => {
    expect(toScoreBars(layers())).toStrictEqual([
      { time: FIRST_SECOND, value: 0, action: 'HOLD' },
      { time: FIRST_SECOND + 3_600, value: 1, action: 'HOLD' },
      { time: FIRST_SECOND + 7_200, value: -1.5, action: 'SELL' },
    ]);
  });

  test('thresholds come as segments in seconds, and none means no line', () => {
    expect(toThresholdSegments(layers())).toStrictEqual([
      { from: FIRST_SECOND, to: FIRST_SECOND + 10_800, buy: 2, sell: -2 },
    ]);
    expect(toThresholdSegments(layers({ thresholds: [] }))).toStrictEqual([]);
  });
});

describe('marker series', () => {
  const sources = [
    { positionKey: 'p2', side: 'sell', candleTime: FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS },
    { positionKey: 'p1', side: 'buy', candleTime: FIRST_CANDLE_TIME + 1_800_000 },
  ] as const;

  test('keeps the position key and side, labels in words and orders by time', () => {
    expect(toSurfaceMarkers(sources, HOUR_MILLISECONDS)).toStrictEqual([
      { key: 'p1:buy', time: FIRST_SECOND, side: 'buy', label: 'Compra', isSelected: false },
      {
        key: 'p2:sell',
        time: FIRST_SECOND + 7_200,
        side: 'sell',
        label: 'Venda',
        isSelected: false,
      },
    ]);
  });

  test('puts the arrow on the candle that contains the fill, whatever the candle size', () => {
    const [marker] = toSurfaceMarkers(sources.slice(1), 4 * HOUR_MILLISECONDS);
    expect(marker?.time).toBe(Date.UTC(2026, 9, 15, 4) / 1_000);
  });

  test('marks the arrows of the selected operation (both sides share the position key)', () => {
    const marked = toSurfaceMarkers(sources, HOUR_MILLISECONDS, 'p2').map(
      (marker) => marker.isSelected,
    );
    expect(marked).toStrictEqual([false, true]);
  });

  test('grouped events (null) draw no arrows', () => {
    expect(toSurfaceMarkers(null, HOUR_MILLISECONDS)).toStrictEqual([]);
  });
});
