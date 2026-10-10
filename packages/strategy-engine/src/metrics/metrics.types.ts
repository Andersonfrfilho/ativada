// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MetricUnavailableReason } from './metrics.constant.js';

// Métrica que pode não se definir: o valor é texto decimal, e o motivo da ausência nunca é `NaN` nem `0`.
export type MetricValue =
  | { readonly value: string; readonly reason: null }
  | { readonly value: null; readonly reason: MetricUnavailableReason };

export type MetricsRun = {
  readonly initialBalance: string;
  readonly timeframeMilliseconds: number;
};

export type PeriodSummary = {
  readonly candles: number;
  readonly startTime: number | null;
  readonly endTime: number | null;
  readonly elapsedMilliseconds: number;
  readonly periodsPerYear: string;
};

export type ReturnMetrics = {
  readonly period: PeriodSummary;
  readonly finalEquity: string | null;
  readonly totalReturn: MetricValue;
  readonly benchmarkReturn: MetricValue;
  readonly excessReturn: MetricValue;
  readonly annualizedReturn: MetricValue;
};

export type RiskRatios = {
  readonly sharpe: MetricValue;
  readonly sortino: MetricValue;
};

// Instantes em `candleOpenTime`; sem queda, os três são nulos e as durações 0.
export type DrawdownMetric = {
  readonly depth: string;
  readonly peakTime: number | null;
  readonly troughTime: number | null;
  readonly recoveryTime: number | null;
  readonly durationCandles: number;
  readonly durationMilliseconds: number;
};

export type DrawdownMetrics = {
  readonly maxDrawdownAtClose: DrawdownMetric;
  readonly maxDrawdownAtLow: DrawdownMetric;
};
