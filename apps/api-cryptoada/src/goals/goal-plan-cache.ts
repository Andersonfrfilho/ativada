// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OperationPlan } from '@cryptoada/strategy-engine';

import { GOAL_CACHE_MAX_ENTRIES } from './goal.constant.js';

export type GoalPlanCacheKey = {
  // O id da meta só chega aqui depois de `findGoal` do dono: outro usuário não alcança a mesma chave.
  readonly goalId: string;
  readonly targetRate: string;
  readonly maxLossRate: string;
  readonly horizonDays: number;
  readonly strategyVersionId: string;
  readonly symbol: string;
  // Abertura do último candle usado: candle novo muda a chave e o plano anterior some da frente.
  readonly lastCandleOpenTime: number | null;
};

export type GoalPlanCache = {
  readonly get: (key: GoalPlanCacheKey) => OperationPlan | undefined;
  readonly set: (key: GoalPlanCacheKey, plan: OperationPlan) => void;
};

function toText(key: GoalPlanCacheKey): string {
  return JSON.stringify([
    key.goalId,
    key.targetRate,
    key.maxLossRate,
    key.horizonDays,
    key.strategyVersionId,
    key.symbol,
    key.lastCandleOpenTime,
  ]);
}

// Memória da instância, limitada: a entrada mais velha sai primeiro; o plano é determinístico e barato de refazer.
export function createGoalPlanCache(maxEntries: number = GOAL_CACHE_MAX_ENTRIES): GoalPlanCache {
  const entries = new Map<string, OperationPlan>();
  return {
    get: (key): OperationPlan | undefined => entries.get(toText(key)),
    set: (key, plan): void => {
      const text = toText(key);
      entries.delete(text);
      entries.set(text, plan);
      if (entries.size <= maxEntries) return;
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    },
  };
}
