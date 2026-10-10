// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../engine-decision.types.js';
import type {
  MetricsClosedPosition,
  MetricValue,
  OpenPositionMetrics,
  RunMetrics,
} from '../metrics/metrics.types.js';
import type { StrategyVersion } from '../strategy-config.types.js';
import type { MetricUnavailableReason } from '../metrics/metrics.constant.js';
import type { OVERFITTING_UNDEFINED_REASON, OverfittingReason } from './walk-forward.constant.js';

// Intervalos semi-abertos em milissegundos: início incluído, fim excluído. O ajuste termina exatamente onde o
// teste começa, e nenhum instante pertence aos dois.
export type WalkForwardWindow = {
  readonly index: number;
  readonly trainStart: number;
  readonly trainEnd: number;
  readonly testStart: number;
  readonly testEnd: number;
  // Primeiro candle do aquecimento: `leadInCandles` candles ANTES do início do ajuste (ou do teste).
  readonly trainLeadInStart: number;
  readonly testLeadInStart: number;
};

export type PlanWalkForwardWindowsParams = {
  readonly start: number;
  readonly end: number;
  readonly trainMonths?: number;
  readonly testMonths?: number;
  readonly stepMonths?: number;
  readonly leadInCandles?: number;
  readonly candleMilliseconds?: number;
};

export type GridValue = number | string;

export type GridAssignment = {
  readonly path: string;
  readonly value: GridValue;
};

export type WalkForwardGrid = {
  readonly parameters: readonly {
    readonly path: string;
    readonly values: readonly GridValue[];
  }[];
};

export type GridCombination = {
  readonly index: number;
  readonly assignment: readonly GridAssignment[];
  readonly strategy: StrategyVersion;
};

export type ParameterCandidate = {
  readonly combinationIndex: number;
  readonly trades: number;
  readonly sharpe: string | null;
  readonly maxDrawdownAtLow: string;
};

export type ParameterSelection =
  | { readonly status: 'ok'; readonly best: ParameterCandidate; readonly eligibleCount: number }
  | { readonly status: 'no_eligible_parameters'; readonly eligibleCount: 0 };

// Resultado BRUTO do teste de uma janela, em unidades da carteira dela (saldo inicial por janela). Os pontos
// são os dos candles do teste; o candle-âncora (o anterior ao teste) não entra.
export type WindowTestResult = {
  readonly index: number;
  readonly equityPoints: readonly EquityPointDecision[];
  readonly closedPositions: readonly MetricsClosedPosition[];
  readonly openPosition: OpenPositionMetrics | null;
};

export type ChainCarry = { readonly equity: string; readonly benchmark: string };

export type ChainedWindowResult = {
  readonly index: number;
  readonly scale: string;
  readonly equityPoints: readonly EquityPointDecision[];
  readonly trades: readonly MetricsClosedPosition[];
  readonly endEquity: string;
  readonly endBenchmark: string;
  // A posição aberta no fim da janela vira operação encerrada pela liquidação (a próxima janela recomeça parada).
  readonly liquidatedAtWindowEnd: boolean;
};

export type OutOfSampleReport = {
  readonly equityPoints: readonly EquityPointDecision[];
  readonly closedPositions: readonly MetricsClosedPosition[];
  readonly metrics: RunMetrics;
};

export type OverfittingWindow = {
  readonly isEligible: boolean;
  readonly inSampleSharpe: string | null;
  // Peso na média do Sharpe dentro da amostra: a quantidade de pontos do ajuste.
  readonly weight: number;
};

export type OverfittingUndefinedReason =
  (typeof OVERFITTING_UNDEFINED_REASON)[keyof typeof OVERFITTING_UNDEFINED_REASON];

export type OverfittingValue =
  | { readonly value: string; readonly reason: null }
  | { readonly value: null; readonly reason: OverfittingUndefinedReason | MetricUnavailableReason };

export type OverfittingAlert = {
  readonly isAlert: boolean;
  readonly reasons: readonly OverfittingReason[];
  readonly inSampleSharpe: OverfittingValue;
  readonly outOfSampleSharpe: MetricValue;
  readonly degradation: OverfittingValue;
  readonly eligibleWindows: number;
  readonly totalWindows: number;
};
