// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createGoalRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import { createGoalEvaluationCache } from '../goals/goal-evaluation-cache.js';
import type { ComputeGoalCombination } from '../goals/goal-evaluation-pool.js';
import { createGoalEvaluationUseCase } from '../goals/goal-evaluation.use-case.js';
import { createGoalPlanCache } from '../goals/goal-plan-cache.js';
import { createGoalPlanUseCase } from '../goals/goal-plan.use-case.js';
import { MAX_GOALS_PER_USER } from '../goals/goal.constant.js';
import {
  createCreateGoalUseCase,
  createDeleteGoalUseCase,
  createGetGoalUseCase,
  createListGoalsUseCase,
  createUpdateGoalUseCase,
} from '../goals/goal.use-cases.js';
import type { GoalRouteDependencies } from '../goals/goals.routes.js';
import type { ColdEvaluationWiring } from './create-cold-evaluation-gates.js';

export type GoalRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
  readonly computeGoal: ComputeGoalCombination;
};

export function createGoalDependencies(
  params: GoalRouteParams,
  cold: ColdEvaluationWiring,
): GoalRouteDependencies {
  const { database, environment } = params;
  const goals = createGoalRepository(database);
  const dependencies = { goals, maxGoals: MAX_GOALS_PER_USER, coldBudget: cold.budget };
  return {
    enabledSymbols: environment.MARKET_SYMBOLS,
    createGoal: createCreateGoalUseCase(dependencies),
    listGoals: createListGoalsUseCase(dependencies),
    getGoal: createGetGoalUseCase(dependencies),
    updateGoal: createUpdateGoalUseCase(dependencies),
    deleteGoal: createDeleteGoalUseCase(dependencies),
    evaluateGoal: createGoalEvaluationUseCase({
      goals,
      strategies: createStrategyRepository(database),
      candles: createCandleRepository(database),
      sentiments: createSentimentObservationRepository(database),
      exchange: environment.MARKET_EXCHANGE,
      symbols: environment.MARKET_SYMBOLS,
      now: params.now,
      cache: createGoalEvaluationCache(),
      compute: params.computeGoal,
      coldGate: cold.goalGate,
    }),
    getGoalPlan: createGoalPlanUseCase({
      goals,
      strategies: createStrategyRepository(database),
      candles: createCandleRepository(database),
      sentiments: createSentimentObservationRepository(database),
      exchange: environment.MARKET_EXCHANGE,
      now: params.now,
      cache: createGoalPlanCache(),
    }),
  };
}
