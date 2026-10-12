// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Engine, RunMetrics } from '@ativada/strategy-engine';

import type {
  BACKTEST_OUTCOME_STATUS,
  BACKTEST_PHASE,
  BacktestErrorCode,
} from './backtest.constant.js';
import type { BacktestDatabase } from './backtest-database.types.js';

export type PhaseMilliseconds = Readonly<
  Record<(typeof BACKTEST_PHASE)[keyof typeof BACKTEST_PHASE], number>
>;

export type BacktestOptions = {
  readonly engine?: Engine;
  // Relógio do corte do candle aberto: só candle com fechamento já passado entra.
  readonly now?: () => number;
  readonly batchSize?: number;
  readonly onProgress?: (progress: number) => void;
};

export type RunBacktestParams = {
  readonly database: BacktestDatabase;
  readonly runId: string;
  readonly options?: BacktestOptions;
};

export type BacktestCompleted = {
  readonly status: typeof BACKTEST_OUTCOME_STATUS.COMPLETED;
  readonly runId: string;
  readonly processedCandles: number;
  readonly batches: number;
  readonly gapCandles: number;
  readonly metrics: RunMetrics;
  readonly phases: PhaseMilliseconds;
};

export type BacktestCancelled = {
  readonly status: typeof BACKTEST_OUTCOME_STATUS.CANCELLED;
  readonly runId: string;
  readonly processedCandles: number;
  readonly batches: number;
};

// `isRecorded`: o `failed` chegou ao banco; falso quando nem isso foi possível (o banco caiu junto).
export type BacktestFailed = {
  readonly status: typeof BACKTEST_OUTCOME_STATUS.FAILED;
  readonly runId: string;
  readonly errorCode: BacktestErrorCode;
  readonly message: string;
  readonly isRecorded: boolean;
};

export type BacktestOutcome = BacktestCompleted | BacktestCancelled | BacktestFailed;
