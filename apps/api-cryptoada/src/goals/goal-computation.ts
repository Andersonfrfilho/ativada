// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeLatestTriggers,
  evaluateGoal,
  GoalInputError,
  TRIGGER_STATE,
  type EvaluateGoalParams,
} from '@cryptoada/strategy-engine';

import type { CachedCombination } from './goal-evaluation-cache.js';

export const GOAL_COMPUTATION_KIND = { COMPUTED: 'computed', UNAVAILABLE: 'unavailable' } as const;

// O que a avaliação de UMA combinação (estratégia × par) devolve: o cálculo, ou o motivo de o motor recusar os candles.
export type GoalComputation =
  | {
      readonly kind: typeof GOAL_COMPUTATION_KIND.COMPUTED;
      readonly combination: CachedCombination;
    }
  | { readonly kind: typeof GOAL_COMPUTATION_KIND.UNAVAILABLE; readonly reason: string };

// O cálculo puro e síncrono, o MESMO que a thread do pool roda: a API nunca o chama na própria thread.
// Candle que o motor recusa deixa a combinação "indisponível"; qualquer outro erro é defeito e sobe.
export function computeGoalCombination(request: EvaluateGoalParams): GoalComputation {
  try {
    const evaluation = evaluateGoal(request);
    const situation = computeLatestTriggers({
      strategy: request.strategy,
      run: request.run,
      candles: request.candles,
      sentiments: request.sentiments,
      state: TRIGGER_STATE.AWAITING_ENTRY,
    });
    return { kind: GOAL_COMPUTATION_KIND.COMPUTED, combination: { evaluation, situation } };
  } catch (error: unknown) {
    if (!(error instanceof GoalInputError)) throw error;
    return { kind: GOAL_COMPUTATION_KIND.UNAVAILABLE, reason: error.code };
  }
}
