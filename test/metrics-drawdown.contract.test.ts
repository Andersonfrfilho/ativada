// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadMetricsApi } from './fixtures/strategy-engine/metrics/metrics-api.fixture.js';
import {
  METRICS_BASE_TIME,
  SQUARE_ROOT_TIMEFRAME,
  buildPoints,
  type PointSpec,
} from './fixtures/strategy-engine/metrics/metrics-series.fixture.js';

const { computeDrawdowns, parseEquityPoints } = await loadMetricsApi();
const TIMEFRAME = SQUARE_ROOT_TIMEFRAME;

function at(index: number): number {
  return METRICS_BASE_TIME + index * TIMEFRAME;
}

function drawdownsOf(specs: readonly PointSpec[]): ReturnType<typeof computeDrawdowns> {
  return computeDrawdowns({
    points: parseEquityPoints(buildPoints({ specs, timeframeMilliseconds: TIMEFRAME })),
  });
}

function closes(...equities: string[]): PointSpec[] {
  return equities.map((equity) => ({ equity }));
}

describe('drawdown (series A, by hand)', () => {
  // Fechamentos: 100, 110, 107,8, 114,268, 113,12532, 115,3878264.
  // Pico 110 (índice 1) → vale 107,8 (índice 2): (110 − 107,8) ÷ 110 = 0,02; recupera no índice 3 (114,268 ≥ 110).
  // Depois 114,268 → 113,12532: 1,14268 ÷ 114,268 = 0,01, menor. Mínimas: 100, 108, 104,5, 114,268, 112, 115,3878264.
  // Na mínima: (110 − 104,5) ÷ 110 = 5,5 ÷ 110 = 0,05 no índice 2; as outras são menores (0,0182, 0,0198).
  const result = drawdownsOf([
    { equity: '100', low: '100' },
    { equity: '110', low: '108' },
    { equity: '107.8', low: '104.5' },
    { equity: '114.268', low: '114.268' },
    { equity: '113.12532', low: '112' },
    { equity: '115.3878264', low: '115.3878264' },
  ]);

  test('at the close: 2% from the peak at index 1 to the trough at index 2, recovered at index 3', () => {
    expect(result.maxDrawdownAtClose).toStrictEqual({
      depth: '0.02',
      peakTime: at(1),
      troughTime: at(2),
      recoveryTime: at(3),
      durationCandles: 2,
      durationMilliseconds: 2 * TIMEFRAME,
    });
  });

  test('at the low: 5% — the honest figure is deeper than the one at the close', () => {
    expect(result.maxDrawdownAtLow).toStrictEqual({
      depth: '0.05',
      peakTime: at(1),
      troughTime: at(2),
      recoveryTime: at(3),
      durationCandles: 2,
      durationMilliseconds: 2 * TIMEFRAME,
    });
  });
});

describe('drawdown edges', () => {
  test('never recovered: the duration runs from the peak to the last point', () => {
    // 100 → 120 (pico, índice 1) → 90: 30 ÷ 120 = 0,25; depois 100 e 95, nunca volta a 120.
    const result = drawdownsOf(closes('100', '120', '90', '100', '95'));
    expect(result.maxDrawdownAtClose).toStrictEqual({
      depth: '0.25',
      peakTime: at(1),
      troughTime: at(2),
      recoveryTime: null,
      durationCandles: 3,
      durationMilliseconds: 3 * TIMEFRAME,
    });
  });

  test('two drops of the same depth: the OLDEST wins', () => {
    // 110 → 99 = 11 ÷ 110 = 0,1 e 120 → 108 = 12 ÷ 120 = 0,1. Vale a primeira (pico 1, vale 2, recupera em 3).
    const result = drawdownsOf(closes('100', '110', '99', '110', '120', '108'));
    expect(result.maxDrawdownAtClose).toStrictEqual({
      depth: '0.1',
      peakTime: at(1),
      troughTime: at(2),
      recoveryTime: at(3),
      durationCandles: 2,
      durationMilliseconds: 2 * TIMEFRAME,
    });
  });

  test('equal depths that never terminate (1/3 and 2/6) are exactly equal: the oldest still wins', () => {
    const result = drawdownsOf(closes('3', '2', '3', '6', '4'));
    expect(result.maxDrawdownAtClose.depth).toBe('0.333333333333');
    expect(result.maxDrawdownAtClose.peakTime).toBe(at(0));
    expect(result.maxDrawdownAtClose.troughTime).toBe(at(1));
    expect(result.maxDrawdownAtClose.recoveryTime).toBe(at(2));
  });

  test('a deeper later drop replaces an older shallow one', () => {
    const result = drawdownsOf(closes('100', '110', '99', '120', '90'));
    expect(result.maxDrawdownAtClose.depth).toBe('0.25');
    expect(result.maxDrawdownAtClose.peakTime).toBe(at(3));
    expect(result.maxDrawdownAtClose.recoveryTime).toBeNull();
    expect(result.maxDrawdownAtClose.durationCandles).toBe(1);
  });

  test('a return to the exact peak ends the old drop: a later deeper drop starts at the later touch', () => {
    // 110 → 105 (4,5%), volta exatamente a 110 (índice 3) e cai a 95: 15 ÷ 110. O pico dessa queda é o índice 3.
    const result = drawdownsOf(closes('100', '110', '105', '110', '95'));
    expect(result.maxDrawdownAtClose.peakTime).toBe(at(3));
    expect(result.maxDrawdownAtClose.troughTime).toBe(at(4));
    expect(result.maxDrawdownAtClose.recoveryTime).toBeNull();
    expect(result.maxDrawdownAtClose.durationCandles).toBe(1);
    expect(result.maxDrawdownAtClose.depth).toBe('0.136363636364');
  });

  test('the peak is the running maximum of the CLOSE, not of the low', () => {
    // Pico de fechamento 120; a mínima do candle seguinte (96) cai 20%. Um pico tomado da mínima daria outra conta.
    const result = drawdownsOf([
      { equity: '100' },
      { equity: '120', low: '118' },
      { equity: '110', low: '96' },
    ]);
    expect(result.maxDrawdownAtLow.depth).toBe('0.2');
    expect(result.maxDrawdownAtLow.peakTime).toBe(at(1));
    expect(result.maxDrawdownAtClose.depth).toBe('0.083333333333');
  });

  test('a candle that dips and closes at a new high recovers within itself (duration 0)', () => {
    const result = drawdownsOf([{ equity: '100' }, { equity: '120', low: '90' }]);
    expect(result.maxDrawdownAtClose.depth).toBe('0');
    expect(result.maxDrawdownAtLow).toStrictEqual({
      depth: '0.25',
      peakTime: at(1),
      troughTime: at(1),
      recoveryTime: at(1),
      durationCandles: 0,
      durationMilliseconds: 0,
    });
  });

  test('a rising series has no drawdown: depth 0, no instants, zero duration', () => {
    const none = {
      depth: '0',
      peakTime: null,
      troughTime: null,
      recoveryTime: null,
      durationCandles: 0,
      durationMilliseconds: 0,
    };
    expect(drawdownsOf(closes('100', '101', '101', '105'))).toStrictEqual({
      maxDrawdownAtClose: none,
      maxDrawdownAtLow: none,
    });
  });

  test('one point and no points have no drawdown', () => {
    expect(drawdownsOf(closes('100')).maxDrawdownAtLow.depth).toBe('0');
    expect(drawdownsOf([]).maxDrawdownAtClose.depth).toBe('0');
  });
});
