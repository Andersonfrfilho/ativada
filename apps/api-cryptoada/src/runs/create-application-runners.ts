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

export type ApplicationRunners = {
  readonly backtestRunner: BacktestThreadRunner;
  readonly walkForwardRunner: WalkForwardThreadRunner;
};

export type ApplicationRunnersParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
};

// O que a thread precisa para abrir o PRÓPRIO banco: a URL e, se houver, a CA (PEM) em que o certificado dele é verificado.
function databaseEnvironmentOf(
  environment: Pick<Environment, 'DATABASE_URL' | 'DATABASE_SSL_ROOT_CERT'>,
): Record<string, string> {
  return {
    DATABASE_URL: environment.DATABASE_URL,
    ...(environment.DATABASE_SSL_ROOT_CERT === undefined
      ? {}
      : { DATABASE_SSL_ROOT_CERT: environment.DATABASE_SSL_ROOT_CERT }),
  };
}

function createBacktestRunner(params: ApplicationRunnersParams): BacktestThreadRunner {
  const database = createBacktestDatabase(params.database);
  return createBacktestThreadRunner({
    workerUrl: new URL('../backtest/backtest.worker.ts', import.meta.url).href,
    workerEnvironment: databaseEnvironmentOf(params.environment),
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
      ...databaseEnvironmentOf(environment),
      WALK_FORWARD_THREADS: String(environment.WALK_FORWARD_THREADS),
    },
    timeoutMilliseconds: environment.WALK_FORWARD_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
    recordFailure: (failure) => failWalkForwardRun({ database, ...failure }),
  });
}

// Os executores de `worker_thread` (backtest e walk-forward). Quem decide QUANDO cada execução roda é o despachante da
// fila (`queue/create-application-dispatcher.ts`), montado em `create-application.ts`.
export function createApplicationRunners(params: ApplicationRunnersParams): ApplicationRunners {
  return {
    backtestRunner: createBacktestRunner(params),
    walkForwardRunner: createWalkForwardRunner(params),
  };
}
