// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ClosedPositionDecision, EquityPointDecision } from '../engine-decision.types.js';
import type { ExitReason } from '../engine-vocabulary.constant.js';
import type { METRICS_VERSION, MetricUnavailableReason } from './metrics.constant.js';

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

// Só o que a métrica lê de uma operação fechada do motor.
export type MetricsClosedPosition = Pick<
  ClosedPositionDecision,
  'openedCandleOpenTime' | 'candleOpenTime' | 'entryFee' | 'exitFee' | 'netProfit' | 'exitReason'
>;

// A posição ainda aberta no último fechamento: `unrealizedProfit` é o valor de liquidação menos o débito de
// compra (que já inclui a taxa de entrada).
export type OpenPositionMetrics = {
  readonly openedCandleOpenTime: number;
  readonly entryFee: string;
  readonly unrealizedProfit: string;
};

export type TradeMetrics = {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: MetricValue;
  readonly profitFactor: MetricValue;
  readonly averageTrade: MetricValue;
  readonly expectancy: MetricValue;
  readonly averageWin: MetricValue;
  readonly averageLoss: MetricValue;
  readonly payoffRatio: MetricValue;
  readonly maxConsecutiveLosses: number;
  readonly feesPaid: string;
  readonly grossProfit: string;
  readonly grossLoss: string;
  readonly netProfit: string;
  readonly exitReasonCounts: Readonly<Record<ExitReason, number>>;
};

export type RunMetrics = ReturnMetrics &
  RiskRatios &
  DrawdownMetrics &
  TradeMetrics & {
    readonly version: typeof METRICS_VERSION;
    readonly initialBalance: string;
    readonly exposure: MetricValue;
    readonly tradesPerYear: MetricValue;
    readonly openPosition: OpenPositionMetrics | null;
  };

export type ComputeRunMetricsParams = {
  readonly equityPoints: readonly EquityPointDecision[];
  readonly closedPositions: readonly MetricsClosedPosition[];
  readonly openPosition: OpenPositionMetrics | null;
  readonly run: MetricsRun;
};

export type RunReconciliation = {
  readonly expectedVariation: string;
  readonly realizedProfit: string;
  readonly unrealizedProfit: string;
  readonly accountedVariation: string;
  readonly difference: string;
  readonly isReconciled: boolean;
};
