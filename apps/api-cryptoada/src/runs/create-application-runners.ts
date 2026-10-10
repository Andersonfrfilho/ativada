// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseHandle } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import {
  createBacktestThreadRunner,
  type BacktestThreadRunner,
} from '../backtest/backtest-thread-runner.js';
import { createBacktestDatabase } from '../backtest/create-backtest-database.js';
import { failBacktestRun } from '../backtest/run-backtest.js';
import type { Environment } from '../environment.js';
import { createWalkForwardDatabase } from '../walk-forward/create-walk-forward-database.js';
import { failWalkForwardRun } from '../walk-forward/run-walk-forward.js';
import {
  createWalkForwardThreadRunner,
  type WalkForwardThreadRunner,
} from '../walk-forward/walk-forward-thread-runner.js';
import { createDirectRunDispatcher } from './create-direct-run-dispatcher.js';
import type { RunDispatcher } from './run-dispatcher.js';

export type ApplicationRunners = {
  readonly backtestRunner: BacktestThreadRunner;
  readonly walkForwardRunner: WalkForwardThreadRunner;
  readonly dispatcher: RunDispatcher;
};

export type ApplicationRunnersParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly reportUnexpectedError: (error: unknown) => void;
};

function createBacktestRunner(params: ApplicationRunnersParams): BacktestThreadRunner {
  const database = createBacktestDatabase(params.database);
  return createBacktestThreadRunner({
    workerUrl: new URL('../backtest/backtest.worker.ts', import.meta.url).href,
    workerEnvironment: { DATABASE_URL: params.environment.DATABASE_URL },
    timeoutMilliseconds: params.environment.BACKTEST_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
    recordFailure: (failure) => failBacktestRun({ database, ...failure }),
  });
}

function createWalkForwardRunner(params: ApplicationRunnersParams): WalkForwardThreadRunner {
  const database = createWalkForwardDatabase(params.database);
  const { environment } = params;
  return createWalkForwardThreadRunner({
    workerUrl: new URL('../walk-forward/walk-forward.worker.ts', import.meta.url).href,
    workerEnvironment: {
      DATABASE_URL: environment.DATABASE_URL,
      WALK_FORWARD_THREADS: String(environment.WALK_FORWARD_THREADS),
    },
    timeoutMilliseconds: environment.WALK_FORWARD_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
    recordFailure: (failure) => failWalkForwardRun({ database, ...failure }),
  });
}

// Executores de `worker_thread` e a PORTA que as rotas usam para despachar (ADR 0002, T3.4). A T3.6 troca só o
// `dispatcher` daqui por uma fila com tetos por usuário.
export function createApplicationRunners(params: ApplicationRunnersParams): ApplicationRunners {
  const backtestRunner = createBacktestRunner(params);
  const walkForwardRunner = createWalkForwardRunner(params);
  return {
    backtestRunner,
    walkForwardRunner,
    dispatcher: createDirectRunDispatcher({
      backtestRunner,
      walkForwardRunner,
      reportUnexpectedError: params.reportUnexpectedError,
    }),
  };
}
