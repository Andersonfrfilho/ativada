// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRecord } from '@cryptoada/database';
import type {
  EngineCandle,
  RunSetup,
  SentimentObservation,
  StrategyVersion,
} from '@cryptoada/strategy-engine';

import { GOAL_COMPUTATION_KIND, type GoalComputation } from './goal-computation.js';
import type { GoalCacheKeyParams, GoalEvaluationCache } from './goal-evaluation-cache.js';
import type { ComputeGoalCombination } from './goal-evaluation-pool.js';
import type { GoalStrategyRef } from './goal-evaluation-view.js';

export type CombinationDependencies = {
  readonly cache: GoalEvaluationCache;
  // O cálculo roda numa thread do pool (nunca na da API): por isso devolve uma promessa e aceita cancelamento.
  readonly compute: ComputeGoalCombination;
};

export type StrategyEntry = {
  readonly ref: GoalStrategyRef;
  readonly strategy: StrategyVersion;
  readonly usesSentiment: boolean;
};

export type CombinationRequest = {
  readonly goal: GoalRecord;
  readonly entry: StrategyEntry;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type CombinationKeyParams = Pick<CombinationRequest, 'goal' | 'entry' | 'run' | 'candles'>;

function lastOpenTimeOf(candles: readonly EngineCandle[]): number | null {
  return candles.at(-1)?.openTime ?? null;
}

export function buildCombinationKey(request: CombinationKeyParams): GoalCacheKeyParams {
  const { goal, entry, run, candles } = request;
  return {
    goalId: goal.id,
    targetRate: goal.targetRate,
    maxLossRate: goal.maxLossRate,
    horizonDays: goal.horizonDays,
    strategyVersionId: entry.ref.versionId,
    symbol: run.parameters.symbol,
    lastCandleOpenTime: lastOpenTimeOf(candles),
  };
}

// Avalia UMA combinação (estratégia × par), ou devolve o que já foi calculado para a mesma meta, versão, par e último
// candle. A meta do motor leva só os três números da meta: o par dela não entra no cálculo.
export async function evaluateCombination(
  dependencies: CombinationDependencies,
  request: CombinationRequest,
): Promise<GoalComputation> {
  const { goal, entry, run, candles } = request;
  const key = buildCombinationKey(request);
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return { kind: GOAL_COMPUTATION_KIND.COMPUTED, combination: cached };
  const computation = await dependencies.compute(
    {
      strategy: entry.strategy,
      run,
      candles,
      sentiments: request.sentiments,
      goal: {
        targetRate: goal.targetRate,
        maxLossRate: goal.maxLossRate,
        horizonDays: goal.horizonDays,
      },
    },
    request.signal,
  );
  if (computation.kind === GOAL_COMPUTATION_KIND.COMPUTED) {
    dependencies.cache.set(key, computation.combination);
  }
  return computation;
}
