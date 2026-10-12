// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BACKTEST_PHASE, type BacktestPhase } from './backtest.constant.js';
import type { PhaseMilliseconds } from './backtest.types.js';

export type PhaseTimer = {
  readonly measure: <TResult>(
    phase: BacktestPhase,
    work: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly measureSync: <TResult>(phase: BacktestPhase, work: () => TResult) => TResult;
  readonly totals: () => PhaseMilliseconds;
};

// Decompõe o tempo de parede em carga, motor, gravação e métricas (RNF01 mede o conjunto).
export function createPhaseTimer(): PhaseTimer {
  const totals: Record<BacktestPhase, number> = {
    [BACKTEST_PHASE.LOAD]: 0,
    [BACKTEST_PHASE.ENGINE]: 0,
    [BACKTEST_PHASE.WRITE]: 0,
    [BACKTEST_PHASE.METRICS]: 0,
  };
  return {
    async measure<TResult>(phase: BacktestPhase, work: () => Promise<TResult>): Promise<TResult> {
      const startedAt = performance.now();
      try {
        return await work();
      } finally {
        totals[phase] += performance.now() - startedAt;
      }
    },
    measureSync<TResult>(phase: BacktestPhase, work: () => TResult): TResult {
      const startedAt = performance.now();
      try {
        return work();
      } finally {
        totals[phase] += performance.now() - startedAt;
      }
    },
    totals: () => ({ ...totals }),
  };
}
