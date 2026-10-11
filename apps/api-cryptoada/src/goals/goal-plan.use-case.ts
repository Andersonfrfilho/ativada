// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  GoalRecord,
  GoalRepository,
  OwnerScope,
  StrategyRepository,
} from '@cryptoada/database';
import {
  computeLatestPlan,
  createStrategyVersion,
  RULE_KIND,
  StrategyConfigError,
  type OperationPlan,
  type StrategyVersion,
} from '@cryptoada/strategy-engine';

import { StrategyNotFoundError } from '../strategies/strategy.error.js';
import type { GoalPlanCache, GoalPlanCacheKey } from './goal-plan-cache.js';
import { loadSymbolSeries, type SeriesReader } from './goal-evaluation-series.js';
import type { GoalStrategyReader } from './goal-evaluation-strategies.js';
import type { GoalStrategyRef } from './goal-evaluation-view.js';
import { toGoalView, type GoalView } from './goal-views.js';
import { GoalNotFoundError, GoalPlanUnavailableError } from './goal.error.js';

export type GoalPlanDependencies = SeriesReader & {
  readonly goals: Pick<GoalRepository, 'findGoal'>;
  readonly strategies: GoalStrategyReader & Pick<StrategyRepository, 'findStrategy'>;
  readonly now: () => number;
  readonly cache: GoalPlanCache;
};

export type GoalPlanView = {
  readonly goal: GoalView;
  readonly strategy: GoalStrategyRef;
  readonly symbol: string;
  readonly candlesUsed: number;
  readonly lastCandleOpenTime: number | null;
  readonly deadline: string;
  readonly plan: OperationPlan;
};

export type GetGoalPlanUseCase = (
  scope: OwnerScope,
  input: { readonly goalId: string; readonly strategyId: string },
) => Promise<GoalPlanView>;

// A estratégia do dono na versão mais recente; alheia ou inexistente é o mesmo 404.
export async function loadStrategy(
  reader: GoalPlanDependencies['strategies'],
  params: { readonly scope: OwnerScope; readonly strategyId: string },
): Promise<{ readonly ref: GoalStrategyRef; readonly version: StrategyVersion }> {
  const { scope, strategyId } = params;
  const strategy = await reader.findStrategy(scope, strategyId);
  if (strategy === undefined) throw new StrategyNotFoundError();
  const page = await reader.listVersionsPage(scope, { strategyId, limit: 1, after: undefined });
  const newest = page?.versions[0];
  if (newest === undefined) throw new StrategyNotFoundError();
  try {
    return {
      ref: { id: strategy.id, name: strategy.name, versionId: newest.id, version: newest.version },
      version: createStrategyVersion(newest.config),
    };
  } catch (error: unknown) {
    if (error instanceof StrategyConfigError) throw new GoalPlanUnavailableError();
    throw error;
  }
}

type PlanContext = {
  readonly goal: GoalRecord;
  readonly version: StrategyVersion;
  readonly versionId: string;
  readonly series: Awaited<ReturnType<typeof loadSymbolSeries>>;
};

function buildCacheKey(context: PlanContext): GoalPlanCacheKey {
  const { goal, series } = context;
  return {
    goalId: goal.id,
    targetRate: goal.targetRate,
    maxLossRate: goal.maxLossRate,
    horizonDays: goal.horizonDays,
    strategyVersionId: context.versionId,
    symbol: series.symbol,
    lastCandleOpenTime: series.candles.at(-1)?.openTime ?? null,
  };
}

async function buildPlan(
  dependencies: GoalPlanDependencies,
  context: PlanContext,
): Promise<OperationPlan> {
  const { goal, version, series } = context;
  const key = buildCacheKey(context);
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return cached;
  const usesSentiment = version.config.rules.some((rule) => rule.kind === RULE_KIND.FEAR_GREED);
  const plan = computeLatestPlan({
    strategy: version,
    run: series.run,
    candles: series.candles,
    sentiments: usesSentiment ? await series.loadSentiments() : undefined,
    goal: {
      targetRate: goal.targetRate,
      maxLossRate: goal.maxLossRate,
      horizonDays: goal.horizonDays,
    },
  });
  if (plan === null) throw new GoalPlanUnavailableError();
  dependencies.cache.set(key, plan);
  return plan;
}

// O plano de operação de uma meta com uma estratégia do dono, no par da meta, sobre os candles diários (ADR 0002 §"Plano
// de operação (T4b.5)"). Em cache por meta, versão, par e último candle.
export function createGoalPlanUseCase(dependencies: GoalPlanDependencies): GetGoalPlanUseCase {
  return async (scope, input) => {
    const goal = await dependencies.goals.findGoal(scope, input.goalId);
    if (goal === undefined) throw new GoalNotFoundError();
    const { ref, version } = await loadStrategy(dependencies.strategies, {
      scope,
      strategyId: input.strategyId,
    });
    const series = await loadSymbolSeries(dependencies, {
      symbol: goal.symbol,
      now: dependencies.now(),
    });
    const plan = await buildPlan(dependencies, { goal, version, versionId: ref.versionId, series });
    return {
      goal: toGoalView(goal),
      strategy: ref,
      symbol: series.symbol,
      candlesUsed: series.candles.length,
      lastCandleOpenTime: series.candles.at(-1)?.openTime ?? null,
      deadline: new Date(plan.deadlineAt).toISOString(),
      plan,
    };
  };
}
