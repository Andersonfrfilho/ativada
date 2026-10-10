// Copyright (c) 2026 Ada Technology. All rights reserved.
import { WALK_FORWARD_PHASE, type WalkForwardPhase } from './walk-forward.constant.js';
import type { PhaseMilliseconds } from './walk-forward.types.js';

export type PhaseTimer = {
  readonly measure: <TResult>(
    phase: WalkForwardPhase,
    work: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly measureSync: <TResult>(phase: WalkForwardPhase, work: () => TResult) => TResult;
  readonly totals: () => PhaseMilliseconds;
};

// Decompõe o tempo de parede em carga, busca, teste e relatório. Com fases concorrentes (várias threads de busca)
// a soma da fase é o tempo de PAREDE dela, não a soma dos fios.
export function createPhaseTimer(): PhaseTimer {
  const totals: Record<WalkForwardPhase, number> = {
    [WALK_FORWARD_PHASE.LOAD]: 0,
    [WALK_FORWARD_PHASE.SEARCH]: 0,
    [WALK_FORWARD_PHASE.TEST]: 0,
    [WALK_FORWARD_PHASE.REPORT]: 0,
  };
  return {
    async measure<TResult>(
      phase: WalkForwardPhase,
      work: () => Promise<TResult>,
    ): Promise<TResult> {
      const startedAt = performance.now();
      try {
        return await work();
      } finally {
        totals[phase] += performance.now() - startedAt;
      }
    },
    measureSync<TResult>(phase: WalkForwardPhase, work: () => TResult): TResult {
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
