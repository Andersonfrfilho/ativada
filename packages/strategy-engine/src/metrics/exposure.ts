// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '../engine-decimal.js';
import { availableMetric, unavailableMetric } from './metric-value.js';
import type { MetricsPoint } from './metrics-input.js';
import {
  METRIC_UNAVAILABLE_REASON,
  MILLISECONDS_PER_YEAR,
  MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS,
} from './metrics.constant.js';
import type { MetricValue } from './metrics.types.js';
import type { ParsedOpenPosition, ParsedTrade } from './trade-input.js';

type HeldInterval = { readonly from: number; readonly until: number };

export type ExposureParams = {
  readonly points: readonly MetricsPoint[];
  readonly trades: readonly ParsedTrade[];
  readonly openPosition: ParsedOpenPosition | null;
};

// Posição aberta no candle `a` e fechada no candle `c`: segurada nos fechamentos de `a` até `c − 1`.
function buildHeldIntervals(params: ExposureParams): HeldInterval[] {
  const intervals = params.trades.map((trade) => ({
    from: trade.openedTime,
    until: trade.closedTime,
  }));
  if (params.openPosition !== null) {
    intervals.push({ from: params.openPosition.openedTime, until: Number.POSITIVE_INFINITY });
  }
  return intervals;
}

// Os intervalos são disjuntos e em ordem (a entrada confere): um cursor percorre pontos e intervalos juntos.
export function countHeldCloses(params: ExposureParams): number {
  const intervals = buildHeldIntervals(params);
  let cursor = 0;
  let held = 0;
  for (const point of params.points) {
    while (cursor < intervals.length && (intervals[cursor]?.until ?? 0) <= point.time) cursor += 1;
    const current = intervals[cursor];
    if (current !== undefined && current.from <= point.time) held += 1;
  }
  return held;
}

export function computeExposure(params: ExposureParams): MetricValue {
  if (params.points.length === 0) {
    return unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_EQUITY_POINTS);
  }
  return availableMetric(
    new EngineDecimal(countHeldCloses(params)).dividedBy(params.points.length),
  );
}

export function computeTradesPerYear(params: {
  readonly tradeCount: number;
  readonly elapsedMilliseconds: number;
  readonly candles: number;
}): MetricValue {
  if (params.candles === 0) return unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_EQUITY_POINTS);
  if (params.elapsedMilliseconds < MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS) {
    return unavailableMetric(METRIC_UNAVAILABLE_REASON.PERIOD_TOO_SHORT);
  }
  const years = new EngineDecimal(params.elapsedMilliseconds).dividedBy(MILLISECONDS_PER_YEAR);
  return availableMetric(new EngineDecimal(params.tradeCount).dividedBy(years));
}
