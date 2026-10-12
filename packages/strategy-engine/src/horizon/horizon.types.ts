// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { GoalTrajectoryContext } from '../goal/goal-trajectory.js';

// `signals` já calculados (uma vez por série, reaproveitados nos três prazos) e `horizonCandles` do prazo em análise.
export type ComputeHorizonWindowsParams = GoalTrajectoryContext & {
  readonly initial: EngineDecimalValue;
};

// Retorno exato de cada janela (patrimônio no último candle do prazo ÷ saldo inicial − 1), na ordem das janelas.
export type HorizonWindows = {
  readonly returns: EngineDecimalValue[];
  readonly benchmarkReturns: EngineDecimalValue[];
};

export type SummarizeHorizonParams = {
  readonly windows: HorizonWindows;
  readonly horizonDays: number;
};

// Taxas em fração do saldo (0.05 = 5%), arredondadas para BAIXO; `null` quando não há janela.
export type HorizonDistribution = {
  readonly median: string | null;
  readonly positiveRate: string | null;
  readonly worstDecile: string | null;
};

export type HorizonSummary = {
  readonly horizonDays: number;
  readonly windowCount: number;
  readonly positiveCount: number;
  readonly median: string | null;
  readonly positiveRate: string | null;
  readonly worstDecile: string | null;
  readonly isShortHistory: boolean;
  readonly benchmark: HorizonDistribution;
};
