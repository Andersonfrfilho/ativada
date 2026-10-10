// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EngineDecimal, type RunMetrics } from '../packages/strategy-engine/src/index.js';
import {
  loadMetricsApi,
  PROPERTY_SERIES_VARIABLE,
} from './fixtures/strategy-engine/metrics/metrics-api.fixture.js';
import {
  appendPoint,
  buildMetricsCase,
  scaleMetricsCase,
} from './fixtures/strategy-engine/metrics/metrics-generator.fixture.js';

const { computeRunMetrics, reconcileRunMetrics } = await loadMetricsApi();

const DEFAULT_SERIES = 2_000;
const SEED_BASE = 20_261_010;
const SERIES = Number(Bun.env[PROPERTY_SERIES_VARIABLE] ?? DEFAULT_SERIES);
const ZERO = new EngineDecimal(0);
const ONE = new EngineDecimal(1);
const SCALE_FACTORS = [3, 1_000] as const;
// Razões e quedas não dependem da escala do saldo.
const SCALE_FREE_KEYS = [
  'totalReturn',
  'benchmarkReturn',
  'excessReturn',
  'annualizedReturn',
  'sharpe',
  'sortino',
  'maxDrawdownAtClose',
  'maxDrawdownAtLow',
  'winRate',
  'profitFactor',
  'payoffRatio',
  'exposure',
  'tradesPerYear',
  'maxConsecutiveLosses',
  'exitReasonCounts',
] as const satisfies readonly (keyof RunMetrics)[];

function seeds(): number[] {
  return Array.from({ length: SERIES }, (_unused, index) => SEED_BASE + index);
}

function decimalOf(text: string | null): InstanceType<typeof EngineDecimal> {
  return new EngineDecimal(text ?? 'NaN');
}

describe(`metrics properties over ${SERIES} generated series (integer PRNG)`, () => {
  test('there are at least 2 000 series in the full run', () => {
    if (Bun.env[PROPERTY_SERIES_VARIABLE] === undefined)
      expect(SERIES).toBeGreaterThanOrEqual(2_000);
  });

  test('the generator exercises every path (counted over the full run)', () => {
    if (Bun.env[PROPERTY_SERIES_VARIABLE] !== undefined) return;
    const counts = new Map<string, number>();
    const bump = (key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const seed of seeds()) {
      const metrics = computeRunMetrics(buildMetricsCase(seed));
      if (metrics.trades > 0) bump('trades');
      if (metrics.openPosition !== null) bump('open position');
      if (metrics.profitFactor.reason === 'no_losses') bump('only wins');
      if (metrics.profitFactor.value === '0') bump('only losses');
      if (metrics.annualizedReturn.value !== null) bump('annualized');
      if (metrics.maxDrawdownAtLow.recoveryTime === null) bump('unrecovered');
      if (metrics.maxConsecutiveLosses >= 3) bump('streak of 3');
      if (metrics.period.candles === 1) bump('single point');
    }
    for (const [key, minimum] of [
      ['trades', 1_000],
      ['open position', 800],
      ['only wins', 200],
      ['only losses', 200],
      ['annualized', 200],
      ['unrecovered', 500],
      ['streak of 3', 50],
      ['single point', 10],
    ] as const) {
      expect(counts.get(key) ?? 0).toBeGreaterThanOrEqual(minimum);
    }
  });

  test('deterministic: the same input gives the same answer, and the input is not touched', () => {
    for (const seed of seeds()) {
      const input = buildMetricsCase(seed);
      const snapshot = structuredClone(input);
      const first = computeRunMetrics(input);
      expect(computeRunMetrics(input)).toStrictEqual(first);
      expect(input).toStrictEqual(snapshot);
    }
  });

  test('drawdown is in [0, 1) and the one at the low is never shallower than the one at the close', () => {
    for (const seed of seeds()) {
      const metrics = computeRunMetrics(buildMetricsCase(seed));
      const atClose = decimalOf(metrics.maxDrawdownAtClose.depth);
      const atLow = decimalOf(metrics.maxDrawdownAtLow.depth);
      for (const depth of [atClose, atLow]) {
        expect(depth.greaterThanOrEqualTo(ZERO) && depth.lessThan(ONE)).toBe(true);
      }
      expect(atLow.greaterThanOrEqualTo(atClose)).toBe(true);
    }
  });

  test('win rate and exposure are in [0, 1]; profit factor, averages, fees and gross sums are not negative', () => {
    for (const seed of seeds()) {
      const metrics = computeRunMetrics(buildMetricsCase(seed));
      for (const ratio of [metrics.winRate, metrics.exposure]) {
        if (ratio.value === null) continue;
        const value = decimalOf(ratio.value);
        expect(value.greaterThanOrEqualTo(ZERO) && value.lessThanOrEqualTo(ONE)).toBe(true);
      }
      for (const nonNegative of [metrics.profitFactor, metrics.averageLoss, metrics.payoffRatio]) {
        if (nonNegative.value !== null)
          expect(decimalOf(nonNegative.value).isNegative()).toBe(false);
      }
      for (const amount of [metrics.feesPaid, metrics.grossProfit, metrics.grossLoss]) {
        expect(decimalOf(amount).isNegative()).toBe(false);
      }
    }
  });

  test('the sums agree: gross profit − gross loss = net profit and wins + losses ≤ trades', () => {
    for (const seed of seeds()) {
      const metrics = computeRunMetrics(buildMetricsCase(seed));
      const net = decimalOf(metrics.grossProfit).minus(metrics.grossLoss);
      expect(net.toFixed()).toBe(decimalOf(metrics.netProfit).toFixed());
      expect(metrics.wins + metrics.losses).toBeLessThanOrEqual(metrics.trades);
      const reasons = Object.values(metrics.exitReasonCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(reasons).toBe(metrics.trades);
    }
  });

  test('the drawdown instants are ordered: peak ≤ trough ≤ recovery, and the duration is not negative', () => {
    for (const seed of seeds()) {
      const metrics = computeRunMetrics(buildMetricsCase(seed));
      for (const drawdown of [metrics.maxDrawdownAtClose, metrics.maxDrawdownAtLow]) {
        expect(drawdown.durationCandles).toBeGreaterThanOrEqual(0);
        expect(drawdown.durationMilliseconds).toBeGreaterThanOrEqual(0);
        if (drawdown.peakTime === null || drawdown.troughTime === null) continue;
        expect(drawdown.troughTime).toBeGreaterThanOrEqual(drawdown.peakTime);
        if (drawdown.recoveryTime !== null) {
          expect(drawdown.recoveryTime).toBeGreaterThanOrEqual(drawdown.troughTime);
        }
      }
    }
  });

  test('ratios, drawdowns and Sharpe do not depend on the scale of the balance', () => {
    for (const seed of seeds()) {
      const input = buildMetricsCase(seed);
      const base = computeRunMetrics(input);
      for (const factor of SCALE_FACTORS) {
        const scaled = computeRunMetrics(scaleMetricsCase(input, factor));
        for (const key of SCALE_FREE_KEYS) expect(scaled[key]).toStrictEqual(base[key]);
      }
    }
  });

  test('appending a point at the end never lowers the maximum drawdown', () => {
    for (const seed of seeds()) {
      const input = buildMetricsCase(seed);
      const before = computeRunMetrics(input);
      const after = computeRunMetrics(appendPoint(input, seed + 1));
      for (const key of ['maxDrawdownAtClose', 'maxDrawdownAtLow'] as const) {
        expect(decimalOf(after[key].depth).greaterThanOrEqualTo(decimalOf(before[key].depth))).toBe(
          true,
        );
      }
    }
  });

  test('the maximum drawdown equals the brute-force worst drop over every pair (i ≤ j)', () => {
    for (const seed of seeds().slice(0, Math.min(SERIES, 600))) {
      const input = buildMetricsCase(seed);
      const metrics = computeRunMetrics(input);
      const points = input.equityPoints;
      const worst = (valleyOf: (index: number) => string): string => {
        let deepest = ZERO;
        for (let peak = 0; peak < points.length; peak += 1) {
          const peakEquity = new EngineDecimal(points[peak]?.equity ?? '1');
          for (let valley = peak; valley < points.length; valley += 1) {
            const drop = peakEquity.minus(valleyOf(valley)).dividedBy(peakEquity);
            if (drop.greaterThan(deepest)) deepest = drop;
          }
        }
        return deepest.toDecimalPlaces(12, EngineDecimal.ROUND_HALF_UP).toFixed();
      };
      expect(metrics.maxDrawdownAtClose.depth).toBe(worst((index) => points[index]?.equity ?? '1'));
      expect(metrics.maxDrawdownAtLow.depth).toBe(
        worst((index) => points[index]?.equityAtLow ?? '1'),
      );
    }
  });

  test('when the final equity is the books, the reconciliation closes to the last digit', () => {
    for (const seed of seeds().slice(0, Math.min(SERIES, 600))) {
      const input = buildMetricsCase(seed);
      const open = input.openPosition?.unrealizedProfit ?? '0';
      const realized = computeRunMetrics(input).netProfit;
      const final = new EngineDecimal(input.run.initialBalance).plus(realized).plus(open);
      if (!final.greaterThan(ZERO)) continue;
      const last = input.equityPoints.at(-1);
      if (last === undefined) continue;
      const closed = computeRunMetrics({
        ...input,
        equityPoints: [
          ...input.equityPoints.slice(0, -1),
          { ...last, equity: final.toFixed(), equityAtLow: final.toFixed() },
        ],
      });
      expect(reconcileRunMetrics(closed).isReconciled).toBe(true);
    }
  });
});
