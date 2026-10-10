// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createRunRepository,
  createRunQueueRepository,
  createRunResultRepository,
  createStrategyRepository,
  type DatabaseHandle,
} from '@cryptoada/database';

import type { Environment } from '../environment.js';
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
  };
  const routes: RunRouteDependencies = {
    enabled,
    createRun: createCreateRunUseCase({
      ...shared,
      strategies: createStrategyRepository(database),
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
    runs: createRunDependencies(params, enabled),
  };
}
