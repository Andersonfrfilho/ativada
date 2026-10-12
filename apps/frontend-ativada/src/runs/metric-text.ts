// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatChangePercent, formatDecimal, formatPercent } from '../format/format.js';
import { METRIC_UNAVAILABLE_TEXT } from './run.constant.js';
import type { MetricValue } from './run.validation.js';

export const UNAVAILABLE_DASH = '—';

export type MetricText = { readonly text: string; readonly hint: string | undefined };

function unavailable(metric: MetricValue): MetricText {
  const reason = metric.reason;
  return {
    text: UNAVAILABLE_DASH,
    hint: reason === null ? undefined : (METRIC_UNAVAILABLE_TEXT[reason] ?? reason),
  };
}

// Retorno em fração (0,042 = +4,20%), com sinal.
export function signedRatioText(metric: MetricValue): MetricText {
  if (metric.value === null) return unavailable(metric);
  return { text: formatChangePercent(Number(metric.value)), hint: undefined };
}

export function percentText(metric: MetricValue): MetricText {
  if (metric.value === null) return unavailable(metric);
  return { text: formatPercent(Number(metric.value)), hint: undefined };
}

export function plainText(metric: MetricValue): MetricText {
  if (metric.value === null) return unavailable(metric);
  return { text: formatDecimal(metric.value), hint: undefined };
}
