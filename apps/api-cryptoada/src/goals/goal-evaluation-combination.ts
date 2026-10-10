// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRecord } from '@cryptoada/database';
import {
  computeLatestTriggers,
  TRIGGER_STATE,
  type EngineCandle,
  type EvaluateGoalParams,
  type GoalEvaluation,
  type RunSetup,
  type SentimentObservation,
  type StrategyVersion,
} from '@cryptoada/strategy-engine';

import type { CachedCombination, GoalEvaluationCache } from './goal-evaluation-cache.js';
import type { GoalStrategyRef } from './goal-evaluation-view.js';

export type CombinationDependencies = {
  readonly cache: GoalEvaluationCache;
  readonly evaluate: (request: EvaluateGoalParams) => GoalEvaluation;
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
};

function lastOpenTimeOf(candles: readonly EngineCandle[]): number | null {
  return candles.at(-1)?.openTime ?? null;
}

// Avalia UMA combinação (estratégia × par), ou devolve o que já foi calculado para a mesma meta, versão, par e último
// candle. A meta do motor leva só os três números da meta: o par dela não entra no cálculo.
export function evaluateCombination(
  dependencies: CombinationDependencies,
  request: CombinationRequest,
): CachedCombination {
  const { goal, entry, run, candles } = request;
  const key = {
    goalId: goal.id,
    targetRate: goal.targetRate,
    maxLossRate: goal.maxLossRate,
    horizonDays: goal.horizonDays,
    strategyVersionId: entry.ref.versionId,
    symbol: run.parameters.symbol,
    lastCandleOpenTime: lastOpenTimeOf(candles),
  };
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return cached;
  const evaluation = dependencies.evaluate({
    strategy: entry.strategy,
    run,
    candles,
    sentiments: request.sentiments,
    goal: {
      targetRate: goal.targetRate,
      maxLossRate: goal.maxLossRate,
      horizonDays: goal.horizonDays,
    },
  });
  const situation = computeLatestTriggers({
    strategy: entry.strategy,
    run,
    candles,
    sentiments: request.sentiments,
    state: TRIGGER_STATE.AWAITING_ENTRY,
  });
  const computed: CachedCombination = { evaluation, situation };
  dependencies.cache.set(key, computed);
  return computed;
}
