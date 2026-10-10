// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import type { MetricsPoint } from './metrics-input.js';
import { MILLISECONDS_PER_YEAR } from './metrics.constant.js';
import type { MetricsRun, PeriodSummary } from './metrics.types.js';

export function computePeriodsPerYear(timeframeMilliseconds: number): EngineDecimalValue {
  return new EngineDecimal(MILLISECONDS_PER_YEAR).dividedBy(timeframeMilliseconds);
}

// Do fechamento do primeiro ponto ao do último: o tempo que o patrimônio de fato percorreu.
export function summarizePeriod(points: readonly MetricsPoint[], run: MetricsRun): PeriodSummary {
  const first = points[0];
  const last = points.at(-1);
  const elapsedMilliseconds =
    first === undefined || last === undefined ? 0 : last.time - first.time;
  return {
    candles: points.length,
    startTime: first?.time ?? null,
    endTime: last?.time ?? null,
    elapsedMilliseconds,
    periodsPerYear: formatEngineDecimal(computePeriodsPerYear(run.timeframeMilliseconds)),
  };
}
