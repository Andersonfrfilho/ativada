// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import { availableMetric, unavailableMetric } from './metric-value.js';
import type { MetricsPoint } from './metrics-input.js';
import { METRIC_UNAVAILABLE_REASON, MINIMUM_RETURNS_FOR_RATIOS } from './metrics.constant.js';
import type { MetricsRun, RiskRatios } from './metrics.types.js';
import { computePeriodsPerYear } from './period-summary.js';
import {
  computeDownsideDeviation,
  computeMean,
  computePeriodReturns,
  computeSampleDeviation,
} from './period-statistics.js';

type RatioParams = {
  readonly returns: readonly EngineDecimalValue[];
  readonly annualization: EngineDecimalValue;
};

function computeSharpe(params: RatioParams): RiskRatios['sharpe'] {
  const mean = computeMean(params.returns);
  const deviation = computeSampleDeviation(params.returns, mean);
  if (deviation.isZero()) return unavailableMetric(METRIC_UNAVAILABLE_REASON.ZERO_VOLATILITY);
  return availableMetric(mean.dividedBy(deviation).times(params.annualization));
}

function computeSortino(params: RatioParams): RiskRatios['sortino'] {
  const deviation = computeDownsideDeviation(params.returns);
  if (deviation.isZero()) return unavailableMetric(METRIC_UNAVAILABLE_REASON.ZERO_DOWNSIDE);
  const mean = computeMean(params.returns);
  return availableMetric(mean.dividedBy(deviation).times(params.annualization));
}

// Taxa livre de risco 0; anualiza por √(períodos por ano).
export function computeRiskRatios(params: {
  readonly points: readonly MetricsPoint[];
  readonly run: MetricsRun;
}): RiskRatios {
  const returns = computePeriodReturns(params.points);
  if (returns.length < MINIMUM_RETURNS_FOR_RATIOS) {
    const missing = unavailableMetric(METRIC_UNAVAILABLE_REASON.INSUFFICIENT_RETURNS);
    return { sharpe: missing, sortino: missing };
  }
  const annualization = computePeriodsPerYear(params.run.timeframeMilliseconds).sqrt();
  return {
    sharpe: computeSharpe({ returns, annualization }),
    sortino: computeSortino({ returns, annualization }),
  };
}
