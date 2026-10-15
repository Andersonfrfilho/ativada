// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SurfaceTheme } from '../src/runs/candle-chart/chart-surface.types.js';
import {
  buildSurfaceTheme,
  SURFACE_THEME_TOKENS,
  withAlpha,
} from '../src/runs/candle-chart/chart-theme.js';
import {
  buildConeEdges,
  buildMarkerSpecs,
  buildScoreData,
  buildThresholdLines,
  buildVolumeData,
  chooseLineStyle,
} from '../src/runs/candle-chart/surface-style.js';

const THEME: SurfaceTheme = {
  background: 'rgb(255, 255, 255)',
  text: 'rgb(95, 107, 134)',
  grid: 'rgb(170, 175, 190)',
  up: 'rgb(8, 122, 82)',
  down: 'rgb(192, 53, 61)',
  line: 'rgb(37, 65, 178)',
  coneUp: 'rgb(40, 140, 100)',
  coneDown: 'rgb(200, 90, 95)',
  coneNeutral: 'rgb(120, 130, 150)',
};

describe('chart-theme: tokens em cores', () => {
  test('asks the resolver for exactly the token of each color, nothing hardcoded', () => {
    const asked: string[] = [];
    const theme = buildSurfaceTheme((token) => {
      asked.push(token);
      return `cor(${token})`;
    });
    expect(theme.up).toBe('cor(--buy)');
    expect(theme.coneNeutral).toBe('cor(--cone-neutral)');
    expect(asked.sort()).toEqual(Object.values(SURFACE_THEME_TOKENS).sort());
  });

  test('withAlpha accepts rgb, rgba and hex, and leaves unknown formats as they came', () => {
    expect(withAlpha('rgb(8, 122, 82)', 0.45)).toBe('rgba(8, 122, 82, 0.45)');
    expect(withAlpha('rgba(8, 122, 82, 0.9)', 0.2)).toBe('rgba(8, 122, 82, 0.2)');
    expect(withAlpha('#087a52', 0.5)).toBe('rgba(8, 122, 82, 0.5)');
    expect(withAlpha('color(srgb 0.1 0.2 0.3)', 0.5)).toBe('color(srgb 0.1 0.2 0.3)');
  });
});

describe('surface-style: decisões de desenho', () => {
  test('volume bars take the candle color, lighter', () => {
    const data = buildVolumeData(
      [
        { time: 60, value: 5, isUp: true },
        { time: 120, value: 7, isUp: false },
      ],
      THEME,
    );
    expect(data.map((bar) => bar.color)).toEqual([
      'rgba(8, 122, 82, 0.45)',
      'rgba(192, 53, 61, 0.45)',
    ]);
  });

  test('score bars: buy green, sell red, hold neutral; thresholds come from the last segment', () => {
    const bars = buildScoreData(
      [
        { time: 60, value: 2, action: 'BUY' },
        { time: 120, value: -2, action: 'SELL' },
        { time: 180, value: 1, action: 'HOLD' },
      ],
      THEME,
    );
    expect(bars.map((bar) => bar.color)).toEqual([THEME.up, THEME.down, THEME.coneNeutral]);
    const lines = buildThresholdLines(
      [
        { from: 0, to: 100, buy: 3, sell: -3 },
        { from: 100, to: 200, buy: 2, sell: -2 },
      ],
      THEME,
    );
    expect(lines.map((line) => [line.title, line.price])).toEqual([
      ['compra', 2],
      ['venda', -2],
    ]);
    expect(buildThresholdLines([], THEME)).toEqual([]);
  });

  test('markers: arrow up below the bar for buys, down above for sells, waited dots, all in time order', () => {
    const specs = buildMarkerSpecs(
      [
        { key: 'a:sell', time: 300, side: 'sell', label: 'Venda', isSelected: false },
        { key: 'a:buy', time: 100, side: 'buy', label: 'Compra', isSelected: true },
      ],
      [200],
      THEME,
    );
    expect(specs.map((spec) => spec.time)).toEqual([100, 200, 300]);
    expect(specs[0]).toMatchObject({
      position: 'belowBar',
      shape: 'arrowUp',
      text: 'Compra',
      size: 2,
    });
    expect(specs[1]).toMatchObject({ position: 'inBar', shape: 'circle', text: '' });
    expect(specs[2]).toMatchObject({
      position: 'aboveBar',
      shape: 'arrowDown',
      text: 'Venda',
      size: 1,
    });
    expect(specs[1]?.size).toBeLessThan(1);
  });

  test('line roles keep the strategy lines apart: channel and bands dashed, EMAs solid', () => {
    expect(chooseLineStyle('channel_upper', THEME)).toEqual({ color: THEME.line, isDashed: true });
    expect(chooseLineStyle('band_middle', THEME).isDashed).toBe(true);
    expect(chooseLineStyle('ema_fast', THEME)).toEqual({ color: THEME.line, isDashed: false });
    expect(chooseLineStyle('ema_slow', THEME)).toEqual({
      color: THEME.coneNeutral,
      isDashed: false,
    });
  });

  test('the cone colors the half of the trend side, and the flat line stays at the base (never a target price)', () => {
    const projection = {
      startTime: 60,
      endTime: 120,
      base: 10,
      low: 9,
      high: 11,
      side: 'sell',
    } as const;
    const edges = buildConeEdges(projection, THEME);
    const byKey = Object.fromEntries(edges.map((edge) => [edge.key, edge]));
    expect(byKey['lower']?.color).toBe(THEME.coneDown);
    expect(byKey['upper']?.color).toBe(THEME.coneNeutral);
    expect(byKey['base']?.points.map((point) => point.value)).toEqual([10, 10]);
    expect(byKey['base']?.isDashed).toBe(true);
    expect(byKey['upper']?.points.at(-1)).toEqual({ time: 120, value: 11 });
  });
});
