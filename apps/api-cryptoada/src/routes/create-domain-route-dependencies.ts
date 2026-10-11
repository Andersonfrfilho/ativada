// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createGoalRepository,
  createRunRepository,
  createRunQueueRepository,
  createRunResultRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@cryptoada/database';

import { evaluateGoal } from '@cryptoada/strategy-engine';

import type { Environment } from '../environment.js';
import { createGoalEvaluationCache } from '../goals/goal-evaluation-cache.js';
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
import { createListCandlesUseCase } from '../markets/list-candles.use-case.js';
import type { MarketRouteDependencies } from '../markets/markets.routes.js';
import { createCreateRunUseCase } from '../runs/create-run.use-case.js';
import { createExportRunCsvUseCase } from '../runs/export-run-csv.use-case.js';
import type { RunDispatcher } from '../runs/run-dispatcher.js';
import { createRunSeriesUseCases } from '../runs/run-series.use-cases.js';
import {
  createGetRunUseCase,
  createListRunsUseCase,
  createStopRunUseCase,
} from '../runs/run.use-cases.js';
import type { RunRouteDependencies } from '../runs/runs.routes.js';
import type { RunRoutesBundle } from './create-api-routes.js';
import {
  createAddVersionUseCase,
  createCreateStrategyUseCase,
  createGetStrategyUseCase,
  createListStrategiesUseCase,
  createListVersionsUseCase,
} from '../strategies/strategy.use-cases.js';
import type { StrategyRouteDependencies } from '../strategies/strategies.routes.js';

export type DomainRouteDependencies = {
  readonly markets: MarketRouteDependencies;
  readonly strategies: StrategyRouteDependencies;
  readonly goals: GoalRouteDependencies;
  readonly runs: RunRoutesBundle;
};

export type DomainRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly dispatcher: RunDispatcher;
  readonly now: () => number;
  readonly reportUnexpectedError: (error: unknown) => void;
};

function createStrategyDependencies(database: DatabaseHandle): StrategyRouteDependencies {
  const dependencies = { strategies: createStrategyRepository(database) };
  return {
    createStrategy: createCreateStrategyUseCase(dependencies),
    listStrategies: createListStrategiesUseCase(dependencies),
    getStrategy: createGetStrategyUseCase(dependencies),
    listVersions: createListVersionsUseCase(dependencies),
    addVersion: createAddVersionUseCase(dependencies),
  };
}

function createGoalDependencies(params: DomainRouteParams): GoalRouteDependencies {
  const { database, environment } = params;
  const goals = createGoalRepository(database);
  const dependencies = { goals, maxGoals: MAX_GOALS_PER_USER };
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
      evaluate: evaluateGoal,
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

function createRunDependencies(
  params: DomainRouteParams,
  enabled: MarketRouteDependencies['enabled'],
): RunRoutesBundle {
  const { database, environment } = params;
  const candles = createCandleRepository(database);
  const results = createRunResultRepository(database);
  const shared = {
    runs: createRunRepository(database),
    candles,
    exchange: environment.MARKET_EXCHANGE,
    queue: createRunQueueRepository(database),
    results,
  };
  const routes: RunRouteDependencies = {
    enabled,
    createRun: createCreateRunUseCase({
      ...shared,
      strategies: createStrategyRepository(database),
      goals: createGoalRepository(database),
      dispatcher: params.dispatcher,
      queuePerUserLimit: environment.RUN_QUEUE_PER_USER_LIMIT,
      now: params.now,
      reportUnexpectedError: params.reportUnexpectedError,
    }),
    listRuns: createListRunsUseCase(shared),
    getRun: createGetRunUseCase(shared),
    stopRun: createStopRunUseCase(shared),
  };
  return {
    routes,
    series: createRunSeriesUseCases({ results }),
    exportRunCsv: createExportRunCsvUseCase({ results, now: params.now }),
  };
}

// Mercado, estratégias e execuções (T3.4): os repositórios vêm do pacote do banco e os casos de uso só os conhecem
// pelo tipo; o ambiente decide quais pares e timeframes existem.
export function createDomainRouteDependencies(params: DomainRouteParams): DomainRouteDependencies {
  const { database, environment } = params;
  const enabled = {
    symbols: environment.MARKET_SYMBOLS,
    timeframes: environment.MARKET_TIMEFRAMES,
  };
  return {
    markets: {
      enabled,
      listCandles: createListCandlesUseCase({
        candles: createCandleRepository(database),
        exchange: environment.MARKET_EXCHANGE,
      }),
    },
    strategies: createStrategyDependencies(database),
    goals: createGoalDependencies(params),
    runs: createRunDependencies(params, enabled),
  };
}
