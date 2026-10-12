// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { GoalTrajectoryContext } from '../goal/goal-trajectory.js';
import type { RunMetrics } from '../metrics/metrics.types.js';
import type { IntradayVerdict } from './horizon.constant.js';

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

// Só o que o veredito de 15 minutos lê das métricas do backtest (`RunMetrics` serve).
export type IntradayMetricsInput = Pick<
  RunMetrics,
  'initialBalance' | 'finalEquity' | 'feesPaid' | 'trades'
>;

// `netReturn` e `feeShareOfGross` são frações (0.1 = 10%): o líquido arredondado para BAIXO, a fatia das taxas para
// CIMA (nunca esconde taxa). `feeShareOfGross` é `null` quando o ganho bruto antes das taxas não é positivo.
export type IntradaySummary = {
  readonly netReturn: string | null;
  readonly tradeCount: number;
  readonly feesPaid: string;
  readonly feeShareOfGross: string | null;
  readonly verdict: IntradayVerdict;
};
