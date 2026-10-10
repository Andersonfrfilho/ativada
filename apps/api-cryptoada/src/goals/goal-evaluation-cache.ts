// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalEvaluation, LatestTriggers } from '@cryptoada/strategy-engine';

import { GOAL_CACHE_MAX_ENTRIES } from './goal.constant.js';

// O que a avaliação de UMA combinação (estratégia × par) guarda: o resultado das janelas e a situação no último candle.
export type CachedCombination = {
  readonly evaluation: GoalEvaluation;
  readonly situation: LatestTriggers | null;
};

export type GoalCacheKeyParams = {
  // O id da meta é único e só chega aqui depois de `findGoal` do dono: não há como outro usuário alcançar a mesma chave.
  readonly goalId: string;
  // Só o que muda o resultado: a meta (ganho, prazo, perda), nunca o par nem o estado ligado/desligado dela.
  readonly targetRate: string;
  readonly maxLossRate: string;
  readonly horizonDays: number;
  readonly strategyVersionId: string;
  readonly symbol: string;
  // Abertura do último candle usado: candle novo muda a chave e a avaliação anterior some da frente.
  readonly lastCandleOpenTime: number | null;
};

export type GoalEvaluationCache = {
  readonly get: (key: GoalCacheKeyParams) => CachedCombination | undefined;
  readonly set: (key: GoalCacheKeyParams, value: CachedCombination) => void;
};

export function buildGoalCacheKey(params: GoalCacheKeyParams): string {
  return JSON.stringify([
    params.goalId,
    params.targetRate,
    params.maxLossRate,
    params.horizonDays,
    params.strategyVersionId,
    params.symbol,
    params.lastCandleOpenTime,
  ]);
}

// Memória da instância, limitada: a entrada mais velha sai primeiro. A avaliação é determinística e barata de refazer,
// então perder uma entrada custa só tempo.
export function createGoalEvaluationCache(
  maxEntries: number = GOAL_CACHE_MAX_ENTRIES,
): GoalEvaluationCache {
  const entries = new Map<string, CachedCombination>();
  return {
    get: (key): CachedCombination | undefined => entries.get(buildGoalCacheKey(key)),
    set: (key, value): void => {
      const text = buildGoalCacheKey(key);
      entries.delete(text);
      entries.set(text, value);
      if (entries.size <= maxEntries) return;
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    },
  };
}
