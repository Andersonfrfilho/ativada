// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createGoalRepository,
  createRunRepository,
  type RunRepository,
  type RunResultRepository,
  createRunQueueRepository,
  createRunLiveStatusRepository,
  createRunProjectionRepository,
  createRunResultRepository,
  createSentimentRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import type { ComputeGoalCombination, ComputeHorizonLine } from '../goals/goal-evaluation-pool.js';
import { createColdEvaluationWiring } from './create-cold-evaluation-gates.js';
import { createGoalDependencies } from './create-goal-route-dependencies.js';
import { createHorizonRouteDependencies } from './create-horizon-route-dependencies.js';
import type { GoalRouteDependencies } from '../goals/goals.routes.js';
import type { AssetRouteDependencies } from '../assets/assets.routes.js';
import type { PriceAlertRouteDependencies } from '../price-alerts/price-alerts.routes.js';
import {
  createAssetDependencies,
  createPriceAlertDependencies,
} from './create-portfolio-route-dependencies.js';
import { createNoticeDependencies } from '../notices/create-notice-dependencies.js';
import type { ListNoticesUseCase } from '../notices/list-notices.use-case.js';
import { createListCandlesUseCase } from '../markets/list-candles.use-case.js';
import type { MarketRouteDependencies } from '../markets/markets.routes.js';
import { createCreateRunUseCase } from '../runs/create-run.use-case.js';
import { createExportRunCsvUseCase } from '../runs/export-run-csv.use-case.js';
import type { RunDispatcher } from '../runs/run-dispatcher.js';
import { createRunChartUseCase } from '../runs/chart/run-chart.use-case.js';
import { createAnalystUseCases } from '../runs/analyst/create-analyst-use-cases.js';
import { createLiveStatusUseCase } from '../runs/live-status/live-status.use-case.js';
import { createLiveSummaryUseCase } from '../runs/live-summary/live-summary.use-case.js';
import { createRunDecisionsUseCase } from '../runs/live-status/run-decisions.use-case.js';
import { createProjectionsUseCase } from '../runs/projections/projections.use-case.js';
import { createStrategyLayersUseCase } from '../runs/projections/strategy-layers.use-case.js';
import { createTradeSummaryUseCase } from '../runs/trade-summary/trade-summary.use-case.js';
import { createRunSeriesUseCases } from '../runs/run-series.use-cases.js';
import {
  createGetRunUseCase,
  createListRunsUseCase,
  createStopRunUseCase,
  createDeleteRunUseCase,
} from '../runs/run.use-cases.js';
import type { RunRouteDependencies } from '../runs/runs.routes.js';
import type { LiveAwareUseCases, RunRoutesBundle } from './create-api-routes.js';
import {
  createAddVersionUseCase,
  createDeleteStrategyUseCase,
  createCreateStrategyUseCase,
  createGetStrategyUseCase,
  createListStrategiesUseCase,
  createListVersionsUseCase,
} from '../strategies/strategy.use-cases.js';
import { createGetSentimentUseCase } from '../markets/sentiment.use-case.js';
import type { SentimentRouteDependencies } from '../markets/sentiment.routes.js';
import type { StrategyRouteDependencies } from '../strategies/strategies.routes.js';

export type DomainRouteDependencies = {
  readonly markets: MarketRouteDependencies;
  readonly sentiment: SentimentRouteDependencies;
  readonly strategies: StrategyRouteDependencies;
  readonly goals: GoalRouteDependencies;
  readonly horizons: ReturnType<typeof createHorizonRouteDependencies>;
  readonly priceAlerts: PriceAlertRouteDependencies;
  readonly assets: AssetRouteDependencies;
  readonly listNotices: ListNoticesUseCase;
  readonly runs: RunRoutesBundle;
};

export type DomainRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly dispatcher: RunDispatcher;
  readonly now: () => number;
  readonly reportUnexpectedError: (error: unknown) => void;
  // O limitador do roteador: o orçamento das avaliações a frio de metas gasta dele.
  readonly rateLimiter: RateLimiter;
  // O cálculo do motor roda no pool de threads (nunca na thread da API).
  readonly computeGoal: ComputeGoalCombination;
  readonly computeHorizon: ComputeHorizonLine;
};

function createStrategyDependencies(
  params: Pick<DomainRouteParams, 'database' | 'environment'>,
): StrategyRouteDependencies {
  const dependencies = {
    strategies: createStrategyRepository(params.database),
    limits: {
      maxStrategies: params.environment.STRATEGY_MAX_PER_USER,
      maxVersionsPerStrategy: params.environment.STRATEGY_MAX_VERSIONS_PER_STRATEGY,
    },
  };
  return {
    createStrategy: createCreateStrategyUseCase(dependencies),
    listStrategies: createListStrategiesUseCase(dependencies),
    getStrategy: createGetStrategyUseCase(dependencies),
    listVersions: createListVersionsUseCase(dependencies),
    addVersion: createAddVersionUseCase(dependencies),
    deleteStrategy: createDeleteStrategyUseCase(dependencies),
  };
}

// As leituras do acompanhamento ao vivo (spec 008): o gráfico, o live-status e as decisões compartilham o repositório por
// dono e a versão da estratégia; a hora vem do relógio injetado.
function createLiveAwareUseCases(
  params: DomainRouteParams,
  shared: {
    readonly runs: RunRepository;
    readonly results: RunResultRepository;
    readonly exchange: string;
  },
): LiveAwareUseCases {
  const readers = {
    strategies: createStrategyRepository(params.database),
    live: createRunLiveStatusRepository(params.database),
  };
  const dependencies = { ...readers, runs: shared.runs, exchange: shared.exchange };
  return {
    chart: createRunChartUseCase({ ...shared, ...readers }),
    liveStatus: createLiveStatusUseCase({ ...dependencies, now: params.now }),
    liveSummary: createLiveSummaryUseCase(readers),
    decisions: createRunDecisionsUseCase(dependencies),
    projections: createProjectionsUseCase({
      ...dependencies,
      results: shared.results,
      projections: createRunProjectionRepository(params.database),
    }),
    strategyLayers: createStrategyLayersUseCase({
      ...dependencies,
      results: shared.results,
      projections: createRunProjectionRepository(params.database),
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
      runStorageLimit: environment.RUN_STORAGE_MAX_PER_USER,
      now: params.now,
      reportUnexpectedError: params.reportUnexpectedError,
    }),
    listRuns: createListRunsUseCase(shared),
    getRun: createGetRunUseCase(shared),
    stopRun: createStopRunUseCase(shared),
    deleteRun: createDeleteRunUseCase(shared),
  };
  return {
    routes,
    series: createRunSeriesUseCases({ results }),
    exportRunCsv: createExportRunCsvUseCase({ results, now: params.now }),
    tradeSummary: createTradeSummaryUseCase({ results }),
    ...createLiveAwareUseCases(params, shared),
    ...createAnalystUseCases({ ...params, ...shared }),
  };
}

// Mercado, estratégias e execuções (T3.4): os repositórios vêm do pacote do banco e os casos de uso só os conhecem
// pelo tipo; o ambiente decide quais pares e timeframes existem.
export function createDomainRouteDependencies(params: DomainRouteParams): DomainRouteDependencies {
  const { database, environment } = params;
  const cold = createColdEvaluationWiring(params);
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
    sentiment: {
      getSentiment: createGetSentimentUseCase({ sentiments: createSentimentRepository(database) }),
    },
    strategies: createStrategyDependencies(params),
    goals: createGoalDependencies(params, cold),
    horizons: createHorizonRouteDependencies({ ...params, coldGate: cold.horizonGate }),
    priceAlerts: createPriceAlertDependencies(params),
    assets: createAssetDependencies(params),
    listNotices: createNoticeDependencies(params),
    runs: createRunDependencies(params, enabled),
  };
}
