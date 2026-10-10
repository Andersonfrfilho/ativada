// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { parseEquityPoints } from '../packages/strategy-engine/src/metrics/metrics-input.js';
import { computeReturnMetrics } from '../packages/strategy-engine/src/metrics/return-metrics.js';
import { computeRiskRatios } from '../packages/strategy-engine/src/metrics/risk-ratios.js';
import {
  METRICS_BASE_TIME,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_YEAR,
  SQUARE_ROOT_TIMEFRAME,
  buildPoints,
  equitySeries,
} from './fixtures/strategy-engine/metrics/metrics-series.fixture.js';

const TIMEFRAME = SQUARE_ROOT_TIMEFRAME;
const INITIAL_BALANCE = '100';

// Série A, feita à mão. Retornos por período (E_k ÷ E_{k−1} − 1): +10%, −2%, +6%, −1%, +2%.
//   100 → 110 → 107,8 → 114,268 → 113,12532 → 115,3878264
// Média = (0,10 − 0,02 + 0,06 − 0,01 + 0,02) ÷ 5 = 0,03.
// Desvios: 0,07 −0,05 0,03 −0,04 −0,01; quadrados: 0,0049 + 0,0025 + 0,0009 + 0,0016 + 0,0001 = 0,01.
// Variância amostral = 0,01 ÷ (5 − 1) = 0,0025; desvio = 0,05; Sharpe = 0,03 ÷ 0,05 × √10 000 = 60.
// Desvio de queda = √((0,02² + 0,01²) ÷ 5) = √(0,0005 ÷ 5) = √0,0001 = 0,01; Sortino = 0,03 ÷ 0,01 × 100 = 300.
const SERIES_A_EQUITIES = ['100', '110', '107.8', '114.268', '113.12532', '115.3878264'];
const SERIES_A_BENCHMARKS = ['100', '103', '101', '105', '107', '108'];

function seriesA(timeframeMilliseconds: number = TIMEFRAME): ReturnType<typeof buildPoints> {
  return buildPoints({
    specs: SERIES_A_EQUITIES.map((equity, index) => ({
      equity,
      benchmark: SERIES_A_BENCHMARKS[index] ?? '100',
    })),
    timeframeMilliseconds,
  });
}

function returnsOf(
  equities: readonly string[],
  timeframeMilliseconds = TIMEFRAME,
): ReturnType<typeof computeReturnMetrics> {
  return computeReturnMetrics({
    points: parseEquityPoints(equitySeries({ equities, timeframeMilliseconds })),
    run: { initialBalance: INITIAL_BALANCE, timeframeMilliseconds },
  });
}

function ratiosOf(
  equities: readonly string[],
  timeframeMilliseconds = TIMEFRAME,
): ReturnType<typeof computeRiskRatios> {
  return computeRiskRatios({
    points: parseEquityPoints(equitySeries({ equities, timeframeMilliseconds })),
    run: { initialBalance: INITIAL_BALANCE, timeframeMilliseconds },
  });
}

describe('return metrics (series A, by hand)', () => {
  const result = computeReturnMetrics({
    points: parseEquityPoints(seriesA()),
    run: { initialBalance: INITIAL_BALANCE, timeframeMilliseconds: TIMEFRAME },
  });

  test('total return = 115,3878264 ÷ 100 − 1 = 0,153878264', () => {
    expect(result.totalReturn).toStrictEqual({ value: '0.153878264', reason: null });
    expect(result.finalEquity).toBe('115.3878264');
  });

  test('buy-and-hold return = 108 ÷ 100 − 1 = 0,08 and the excess is 0,153878264 − 0,08', () => {
    expect(result.benchmarkReturn).toStrictEqual({ value: '0.08', reason: null });
    expect(result.excessReturn).toStrictEqual({ value: '0.073878264', reason: null });
  });

  test('five periods of 3 155 760 ms are far below 30 days: no annualized return', () => {
    expect(result.annualizedReturn).toStrictEqual({ value: null, reason: 'period_too_short' });
    expect(result.period).toStrictEqual({
      candles: 6,
      startTime: METRICS_BASE_TIME,
      endTime: METRICS_BASE_TIME + 5 * TIMEFRAME,
      elapsedMilliseconds: 5 * TIMEFRAME,
      periodsPerYear: '10000',
    });
  });
});

describe('annualized return', () => {
  const year = MILLISECONDS_PER_YEAR;

  test('(110 ÷ 100)^(Y ÷ (Y ÷ 10)) − 1 = 1,1^10 − 1 = 1,5937424601', () => {
    const result = returnsOf(['100', '110'], year / 10);
    expect(result.annualizedReturn).toStrictEqual({ value: '1.5937424601', reason: null });
  });

  test('two years elapsed: (121 ÷ 100)^(1 ÷ 2) − 1 = 0,1', () => {
    const result = returnsOf(['100', '121'], 2 * year);
    expect(result.annualizedReturn).toStrictEqual({ value: '0.1', reason: null });
  });

  test('a year is 365,25 days, not 365: the exponent of 1,1 over 73,05 days is 5', () => {
    // Y ÷ 5 = 73,05 dias; 1,1^5 − 1 = 0,61051. Com 365 dias o expoente seria 4,9965… e o texto, outro.
    expect(returnsOf(['100', '110'], year / 5).annualizedReturn.value).toBe('0.61051');
  });

  test('a loss annualizes to a loss: (90 ÷ 100)^(1 ÷ 2) − 1 uses the square root', () => {
    const result = returnsOf(['100', '81'], 2 * year);
    expect(result.annualizedReturn).toStrictEqual({ value: '-0.1', reason: null });
  });

  test('exactly 30 days is annualized; one millisecond less is not', () => {
    const thirtyDays = 30 * MILLISECONDS_PER_DAY;
    expect(returnsOf(['100', '110'], thirtyDays).annualizedReturn.reason).toBeNull();
    expect(returnsOf(['100', '110'], thirtyDays - 1).annualizedReturn).toStrictEqual({
      value: null,
      reason: 'period_too_short',
    });
  });

  test('a single point has no elapsed time: total return exists, annualized does not', () => {
    const result = returnsOf(['105']);
    expect(result.totalReturn).toStrictEqual({ value: '0.05', reason: null });
    expect(result.annualizedReturn.reason).toBe('period_too_short');
  });

  test('no points: every return is null with its reason, never NaN', () => {
    const result = returnsOf([]);
    for (const metric of [
      result.totalReturn,
      result.benchmarkReturn,
      result.excessReturn,
      result.annualizedReturn,
    ]) {
      expect(metric).toStrictEqual({ value: null, reason: 'no_equity_points' });
    }
    expect(result.finalEquity).toBeNull();
    expect(result.period.candles).toBe(0);
  });

  test('periods per year follow the timeframe', () => {
    const perYear = (timeframeMilliseconds: number): string =>
      returnsOf(['100'], timeframeMilliseconds).period.periodsPerYear;
    expect(perYear(900_000)).toBe('35064');
    expect(perYear(3_600_000)).toBe('8766');
    expect(perYear(14_400_000)).toBe('2191.5');
    expect(perYear(MILLISECONDS_PER_DAY)).toBe('365.25');
  });
});

describe('Sharpe and Sortino (series A, by hand)', () => {
  test('Sharpe = 0,03 ÷ 0,05 × 100 = 60 (sample deviation, n − 1)', () => {
    expect(ratiosOf(SERIES_A_EQUITIES).sharpe).toStrictEqual({ value: '60', reason: null });
  });

  test('Sortino = 0,03 ÷ 0,01 × 100 = 300 (downside deviation over ALL five periods)', () => {
    expect(ratiosOf(SERIES_A_EQUITIES).sortino).toStrictEqual({ value: '300', reason: null });
  });

  test('the annualization factor is √(Y ÷ timeframe): 400 periods a year give √400 = 20', () => {
    const ratios = ratiosOf(SERIES_A_EQUITIES, MILLISECONDS_PER_YEAR / 400);
    expect(ratios.sharpe.value).toBe('12');
    expect(ratios.sortino.value).toBe('60');
  });

  test('two periods (+10%, −10%): mean 0, so Sharpe and Sortino are 0', () => {
    const ratios = ratiosOf(['100', '110', '99']);
    expect(ratios.sharpe).toStrictEqual({ value: '0', reason: null });
    expect(ratios.sortino).toStrictEqual({ value: '0', reason: null });
  });
});

describe('Sharpe and Sortino that are not defined', () => {
  test('a flat series has zero deviation: no Sharpe, no Sortino', () => {
    const ratios = ratiosOf(['100', '100', '100', '100']);
    expect(ratios.sharpe).toStrictEqual({ value: null, reason: 'zero_volatility' });
    expect(ratios.sortino).toStrictEqual({ value: null, reason: 'zero_downside' });
  });

  test('constant growth (+10%, +10%) has zero deviation although it is not flat', () => {
    const ratios = ratiosOf(['100', '110', '121']);
    expect(ratios.sharpe.reason).toBe('zero_volatility');
    expect(ratios.sortino.reason).toBe('zero_downside');
  });

  test('constant loss (−10%, −10%): no Sharpe, but Sortino = −0,1 ÷ √((0,01 + 0,01) ÷ 2) × 100 = −100', () => {
    const ratios = ratiosOf(['100', '90', '81']);
    expect(ratios.sharpe.reason).toBe('zero_volatility');
    expect(ratios.sortino).toStrictEqual({ value: '-100', reason: null });
  });

  test('equal non-terminating returns (−2/3, −2/3) are exactly equal: no rounding noise as deviation', () => {
    const ratios = ratiosOf(['9', '3', '1']);
    expect(ratios.sharpe).toStrictEqual({ value: null, reason: 'zero_volatility' });
    expect(ratios.sortino.value).toBe('-100');
  });

  test('fewer than two periods: one period, one point, no points', () => {
    for (const equities of [['100', '110'], ['100'], []]) {
      const ratios = ratiosOf(equities);
      expect(ratios.sharpe).toStrictEqual({ value: null, reason: 'insufficient_returns' });
      expect(ratios.sortino).toStrictEqual({ value: null, reason: 'insufficient_returns' });
    }
  });
});
