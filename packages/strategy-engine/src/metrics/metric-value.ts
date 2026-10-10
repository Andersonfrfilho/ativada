// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { METRICS_DECIMAL_PLACES, type MetricUnavailableReason } from './metrics.constant.js';
import type { MetricValue } from './metrics.types.js';

// A única arredondagem de uma métrica derivada, feita sobre o valor de 40 algarismos.
export function roundMetric(value: EngineDecimalValue): EngineDecimalValue {
  return value.toDecimalPlaces(METRICS_DECIMAL_PLACES, EngineDecimal.ROUND_HALF_UP);
}

export function formatMetric(value: EngineDecimalValue): string {
  return formatEngineDecimal(roundMetric(value));
}

export function availableMetric(value: EngineDecimalValue): MetricValue {
  return { value: formatMetric(value), reason: null };
}

export function unavailableMetric(reason: MetricUnavailableReason): MetricValue {
  return { value: null, reason };
}
