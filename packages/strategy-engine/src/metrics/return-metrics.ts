// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { availableMetric, unavailableMetric } from './metric-value.js';
import type { MetricsPoint } from './metrics-input.js';
import {
  METRIC_UNAVAILABLE_REASON,
  MILLISECONDS_PER_YEAR,
  MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS,
} from './metrics.constant.js';
import type { MetricValue, MetricsRun, ReturnMetrics } from './metrics.types.js';
import { summarizePeriod } from './period-summary.js';

const ONE = new EngineDecimal(1);

export type ComputeReturnMetricsParams = {
  readonly points: readonly MetricsPoint[];
  readonly run: MetricsRun;
};

// (final ÷ inicial)^(ano ÷ decorrido) − 1; horizonte menor que 30 dias não se anualiza (engana).
export function annualizeReturn(
  ratio: EngineDecimalValue,
  elapsedMilliseconds: number,
): MetricValue {
  if (elapsedMilliseconds < MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS) {
    return unavailableMetric(METRIC_UNAVAILABLE_REASON.PERIOD_TOO_SHORT);
  }
  const exponent = new EngineDecimal(MILLISECONDS_PER_YEAR).dividedBy(elapsedMilliseconds);
  return availableMetric(ratio.pow(exponent).minus(ONE));
}

export function computeReturnMetrics(params: ComputeReturnMetricsParams): ReturnMetrics {
  const { points, run } = params;
  const period = summarizePeriod(points, run);
  const last = points.at(-1);
  if (last === undefined) {
    const missing = unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_EQUITY_POINTS);
    return {
      period,
      finalEquity: null,
      totalReturn: missing,
      benchmarkReturn: missing,
      excessReturn: missing,
      annualizedReturn: missing,
    };
  }
  const initial = new EngineDecimal(run.initialBalance);
  const ratio = last.equity.dividedBy(initial);
  const benchmarkRatio = last.benchmark.dividedBy(initial);
  return {
    period,
    finalEquity: formatEngineDecimal(last.equity),
    totalReturn: availableMetric(ratio.minus(ONE)),
    benchmarkReturn: availableMetric(benchmarkRatio.minus(ONE)),
    excessReturn: availableMetric(ratio.minus(benchmarkRatio)),
    annualizedReturn: annualizeReturn(ratio, period.elapsedMilliseconds),
  };
}
