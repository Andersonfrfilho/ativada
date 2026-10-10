// Copyright (c) 2026 Ada Technology. All rights reserved.
// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createCandleRepository,
  createLiveRunRepository,
  openDatabase,
} from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND, runWithEnvironment } from '@cryptoada/environment';
import { createMarketDataClient, createServerClock } from '@cryptoada/market-data';

import { createAlertWiring } from './alerts/create-alert-wiring.js';
import { loadEnvironment, type Environment } from './environment.js';
import { createLiveRunDatabase } from './live/create-live-run-database.js';
import { createGapConfirmation } from './live/gap-confirmation.js';
import { createLiveEvaluator } from './live/live-evaluator.js';
import type { LiveAlertingSettings } from './live/live-run.types.js';
import { createLiveScheduler, type LiveScheduler } from './live/live-scheduler.js';
import { WORKSPACE_NAME } from './index.js';
import { createWorkerLogger, type WorkerLogger } from './logging/worker-logger.js';
import { createShutdownHandler, registerShutdownSignals } from './shutdown.js';
import { createWorker, type Worker } from './stream/create-worker.js';
import { SHUTDOWN_TIMEOUT_MILLISECONDS, WORKER_LOG } from './worker.constant.js';

type WorkerWiringParams = {
  readonly environment: Environment;
  readonly database: ReturnType<typeof openDatabase>;
  readonly logger: WorkerLogger;
  readonly abortController: AbortController;
  readonly unfillable: Set<string>;
  readonly onCandleStored: () => void;
};

function createConfiguredWorker(params: WorkerWiringParams): Worker {
  const { environment, database, logger, abortController } = params;
  const serverClock = createServerClock({
    baseUrl: environment.BINANCE_BASE_URL,
    signal: abortController.signal,
    onWarning: (warning) => logger.warn(WORKER_LOG.SERVER_CLOCK_UNAVAILABLE, warning),
  });
  return createWorker({
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
    unfillable: params.unfillable,
    onCandleStored: params.onCandleStored,
  });
}

// A simulação ao vivo avalia no candle fechado; a lacuna só vale como confirmada quando a recuperação já a tentou.
function createConfiguredLiveScheduler(params: {
  readonly environment: Environment;
  readonly database: ReturnType<typeof openDatabase>;
  readonly logger: WorkerLogger;
  readonly unfillable: Set<string>;
  readonly alerting: LiveAlertingSettings | undefined;
}): LiveScheduler {
  const { environment, database, logger } = params;
  return createLiveScheduler({
    logger,
    pollMilliseconds: environment.LIVE_POLL_SECONDS * MILLISECONDS_PER_SECOND,
    evaluator: createLiveEvaluator({
      claims: createLiveRunRepository(database),
      database: createLiveRunDatabase({ handle: database, exchange: environment.MARKET_EXCHANGE }),
      instanceId: `worker-${Bun.randomUUIDv7()}`,
      heartbeatTimeoutSeconds: environment.LIVE_HEARTBEAT_TIMEOUT_SECONDS,
      isGapConfirmed: createGapConfirmation(params.unfillable),
      logger,
      ...(params.alerting === undefined ? {} : { alerting: params.alerting }),
    }),
  });
}

function reportStarted(params: {
  readonly logger: WorkerLogger;
  readonly environment: Environment;
  readonly isAlertingEnabled: boolean;
}): void {
  const { environment } = params;
  params.logger.info(WORKER_LOG.STARTED, {
    env: environment.ENV,
    exchange: environment.MARKET_EXCHANGE,
    symbols: environment.MARKET_SYMBOLS.length,
    timeframes: environment.MARKET_TIMEFRAMES.length,
    isAlertingEnabled: params.isAlertingEnabled,
  });
}

function startWorker(environment: Environment): void {
  const logger = createWorkerLogger({
    appName: WORKSPACE_NAME,
    write: (line) => process.stdout.write(line),
  });
  const database = openDatabase(environment.DATABASE_URL);
  const unfillable = new Set<string>();
  const alerts = createAlertWiring({ environment, database, logger });
  const live = createConfiguredLiveScheduler({
    environment,
    database,
    logger,
    unfillable,
    alerting: alerts.alerting,
  });
  const worker = createConfiguredWorker({
    environment,
    database,
    logger,
    abortController: new AbortController(),
    unfillable,
    onCandleStored: live.trigger,
  });
  live.start();
  alerts.scheduler?.start();
  reportStarted({ logger, environment, isAlertingEnabled: alerts.scheduler !== undefined });
  registerShutdownSignals(
    createShutdownHandler({
      stopWork: async () => {
        await live.stop();
        await alerts.scheduler?.stop();
        await worker.stop();
      },
      closeResources: () => closeDatabase(database),
      logger,
      timeoutMilliseconds: SHUTDOWN_TIMEOUT_MILLISECONDS,
      exit: (code) => process.exit(code),
    }),
  );
}

runWithEnvironment({ appName: WORKSPACE_NAME, load: loadEnvironment, run: startWorker });
