// Copyright (c) 2026 Ada Technology. All rights reserved.
// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, createCandleRepository, openDatabase } from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND, runWithEnvironment } from '@cryptoada/environment';
import { createMarketDataClient, createServerClock } from '@cryptoada/market-data';

import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';
import { createWorkerLogger } from './logging/worker-logger.js';
import { createShutdownHandler, registerShutdownSignals } from './shutdown.js';
import { createWorker } from './stream/create-worker.js';
import { SHUTDOWN_TIMEOUT_MILLISECONDS, WORKER_LOG } from './worker.constant.js';

function startWorker(environment: Environment): void {
  const logger = createWorkerLogger({
    appName: WORKSPACE_NAME,
    write: (line) => process.stdout.write(line),
  });
  const database = openDatabase(environment.DATABASE_URL);
  const abortController = new AbortController();
  const serverClock = createServerClock({
    baseUrl: environment.BINANCE_BASE_URL,
    signal: abortController.signal,
    onWarning: (warning) => logger.warn(WORKER_LOG.SERVER_CLOCK_UNAVAILABLE, warning),
  });
  const worker = createWorker({
    exchange: environment.MARKET_EXCHANGE,
    symbols: environment.MARKET_SYMBOLS,
    timeframes: environment.MARKET_TIMEFRAMES,
    repository: createCandleRepository(database),
    client: createMarketDataClient({
      baseUrl: environment.BINANCE_BASE_URL,
      clock: serverClock,
      signal: abortController.signal,
    }),
    abortController,
    serverClock,
    logger,
    streamBaseUrl: environment.BINANCE_STREAM_URL,
    staleAfterMilliseconds: environment.STREAM_STALE_SECONDS * MILLISECONDS_PER_SECOND,
    gapLookbackHours: environment.STREAM_GAP_LOOKBACK_HOURS,
    gapCheckMinutes: environment.STREAM_GAP_CHECK_MINUTES,
  });
  logger.info(WORKER_LOG.STARTED, {
    env: environment.ENV,
    exchange: environment.MARKET_EXCHANGE,
    symbols: environment.MARKET_SYMBOLS.length,
    timeframes: environment.MARKET_TIMEFRAMES.length,
  });
  registerShutdownSignals(
    createShutdownHandler({
      stopWork: worker.stop,
      closeResources: () => closeDatabase(database),
      logger,
      timeoutMilliseconds: SHUTDOWN_TIMEOUT_MILLISECONDS,
      exit: (code) => process.exit(code),
    }),
  );
}

runWithEnvironment({ appName: WORKSPACE_NAME, load: loadEnvironment, run: startWorker });
