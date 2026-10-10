// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import type { GoalOutcome, GoalVerdict } from './goal.constant.js';

// Ganho alvo e perda máxima são frações do saldo inicial em texto decimal ("0.03" = +3%); prazo em dias.
export type GoalSpec = {
  readonly targetRate: string;
  readonly maxLossRate: string;
  readonly horizonDays: number;
};

// Os dois níveis de patrimônio que decidem o desfecho, para o cliente mostrar ao lado da taxa.
export type GoalLevels = {
  readonly target: EngineDecimalValue;
  readonly stop: EngineDecimalValue;
};

// Patrimônio de liquidação ao fechamento e no vale do candle (a pior ponta, que mede a perda máxima).
export type GoalPoint = {
  readonly equity: EngineDecimalValue;
  readonly equityAtLow: EngineDecimalValue;
};

export type GoalWindowResult = {
  readonly outcome: GoalOutcome;
  readonly candlesElapsed: number;
  readonly finalValue: EngineDecimalValue;
};

export type GoalBenchmarkResult = {
  readonly outcome: GoalOutcome;
};

export type EvaluateGoalParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly goal: GoalSpec;
  readonly candles: readonly EngineCandle[];
  // Alinhada ao `candles` (mesmo índice): a observação disponível no fechamento de cada candle.
  readonly sentiments?: readonly (SentimentObservation | undefined)[] | undefined;
};

export type GoalBenchmarkSummary = {
  readonly reachedCount: number;
  readonly stoppedCount: number;
  readonly reachRate: string | null;
  readonly stopRate: string | null;
};

export type GoalNetReturn = {
  readonly mean: string | null;
  readonly median: string | null;
};

export type GoalSummary = {
  readonly windowCount: number;
  readonly reachedCount: number;
  readonly stoppedCount: number;
  readonly expiredCount: number;
  readonly reachRate: string | null;
  readonly stopRate: string | null;
  readonly expiredRate: string | null;
  readonly medianCandlesToTarget: string | null;
  readonly medianDaysToTarget: string | null;
  readonly netReturn: GoalNetReturn;
  readonly benchmark: GoalBenchmarkSummary;
};

export type GoalEvaluation = GoalSummary & {
  readonly version: string;
  readonly goal: GoalSpec;
  readonly horizonCandles: number;
  readonly levels: { readonly target: string; readonly stop: string };
  readonly firstWindowOpenTime: number | null;
  readonly lastWindowOpenTime: number | null;
  readonly verdict: GoalVerdict;
};
