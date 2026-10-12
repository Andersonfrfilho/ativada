// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '../../packages/strategy-engine/src/index.js';
import { CANDLE_MILLISECONDS } from './live72.constant.js';

const PERCENT_SCALE = 100;
const PERCENT_DECIMAL_PLACES = 2;
const MISSING_SAMPLE_LIMIT = 5;

export type SeriesPoint = {
  readonly candleTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
  readonly benchmark: string;
};

export type SeriesWindow = {
  readonly periodStart: number;
  readonly windowEnd: number;
  readonly initialBalance: string;
};

export type SeriesStats = {
  readonly expectedCandles: number;
  readonly evaluatedCandles: number;
  readonly missingCandles: number;
  readonly missingSamples: readonly number[];
  readonly initialEquity: string;
  readonly finalEquity: string | null;
  readonly highestEquity: string | null;
  readonly lowestEquityAtLow: string | null;
  readonly strategyReturnPercent: string | null;
  readonly buyAndHoldReturnPercent: string | null;
  readonly differencePercent: string | null;
  readonly maxDrawdownPercent: string | null;
};

function toPercent(fraction: InstanceType<typeof EngineDecimal>): string {
  return fraction.times(PERCENT_SCALE).toFixed(PERCENT_DECIMAL_PLACES);
}

function returnPercent(final: string, initial: string): string | null {
  const base = new EngineDecimal(initial);
  if (base.lte(0)) return null;
  return toPercent(new EngineDecimal(final).div(base).minus(1));
}

function maxDrawdownPercent(points: readonly SeriesPoint[]): string {
  let peak = new EngineDecimal(0);
  let worst = new EngineDecimal(0);
  for (const point of points) {
    peak = EngineDecimal.max(peak, new EngineDecimal(point.equity));
    if (peak.lte(0)) continue;
    const drawdown = new EngineDecimal(point.equityAtLow).minus(peak).div(peak);
    worst = EngineDecimal.min(worst, drawdown);
  }
  return toPercent(worst);
}

function findMissing(points: readonly SeriesPoint[], window: SeriesWindow): readonly number[] {
  const present = new Set(points.map((point) => point.candleTime));
  const expected = countExpectedCandles(window);
  const missing: number[] = [];
  for (let index = 0; index < expected; index += 1) {
    const openTime = window.periodStart + index * CANDLE_MILLISECONDS;
    if (!present.has(openTime)) missing.push(openTime);
  }
  return missing;
}

export function countExpectedCandles(window: SeriesWindow): number {
  return Math.max(0, Math.floor((window.windowEnd - window.periodStart) / CANDLE_MILLISECONDS));
}

function keepWindow(points: readonly SeriesPoint[], window: SeriesWindow): SeriesPoint[] {
  return points
    .filter(
      (point) =>
        point.candleTime >= window.periodStart &&
        point.candleTime + CANDLE_MILLISECONDS <= window.windowEnd,
    )
    .sort((left, right) => left.candleTime - right.candleTime);
}

function emptyStats(window: SeriesWindow): SeriesStats {
  return {
    expectedCandles: countExpectedCandles(window),
    evaluatedCandles: 0,
    missingCandles: countExpectedCandles(window),
    missingSamples: findMissing([], window).slice(0, MISSING_SAMPLE_LIMIT),
    initialEquity: window.initialBalance,
    finalEquity: null,
    highestEquity: null,
    lowestEquityAtLow: null,
    strategyReturnPercent: null,
    buyAndHoldReturnPercent: null,
    differencePercent: null,
    maxDrawdownPercent: null,
  };
}

function difference(left: string | null, right: string | null): string | null {
  if (left === null || right === null) return null;
  return new EngineDecimal(left).minus(right).toFixed(PERCENT_DECIMAL_PLACES);
}

export function computeSeriesStats(
  allPoints: readonly SeriesPoint[],
  window: SeriesWindow,
): SeriesStats {
  const points = keepWindow(allPoints, window);
  const last = points.at(-1);
  if (last === undefined) return emptyStats(window);
  const missing = findMissing(points, window);
  const equities = points.map((point) => new EngineDecimal(point.equity));
  const lows = points.map((point) => new EngineDecimal(point.equityAtLow));
  const strategy = returnPercent(last.equity, window.initialBalance);
  const benchmark = returnPercent(last.benchmark, window.initialBalance);
  return {
    expectedCandles: countExpectedCandles(window),
    evaluatedCandles: points.length,
    missingCandles: missing.length,
    missingSamples: missing.slice(0, MISSING_SAMPLE_LIMIT),
    initialEquity: window.initialBalance,
    finalEquity: last.equity,
    highestEquity: EngineDecimal.max(...equities).toString(),
    lowestEquityAtLow: EngineDecimal.min(...lows).toString(),
    strategyReturnPercent: strategy,
    buyAndHoldReturnPercent: benchmark,
    differencePercent: difference(strategy, benchmark),
    maxDrawdownPercent: maxDrawdownPercent(points),
  };
}
