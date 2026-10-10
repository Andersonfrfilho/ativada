// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import {
  closeDatabase,
  createCandleRepository,
  openDatabase,
} from '../packages/database/src/index.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../packages/market-data/test-support/fake-binance-stream-server.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { waitForSafeClock } from './backfill-test/grid-oracle.js';
import { checkClosedCandleIsStoredAndNoiseIsIgnored } from './stream-test/check-delivery.js';
import { checkDropWithLostCandlesLeavesNoHole } from './stream-test/check-reconnect-gap.js';
import { checkSigtermDuringRecoveryExitsZeroFast } from './stream-test/check-shutdown.js';
import {
  buildSeedCandle,
  computeLastClosedOpenTime,
  hoursFrom,
  prepareScenario,
  type StreamContext,
} from './stream-test/stream-test-context.js';
import {
  HOURS_BEFORE_LAST_CLOSED_AT_SEED_START,
  SEEDED_HOURS,
  SYMBOL,
  TEMPORARY_DATABASE_PREFIX,
  TIMEFRAME,
} from './stream-test/stream-test.constant.js';
import { startWorker, type WorkerProcess } from './stream-test/worker-process.js';

const SEEDED_HISTORY_HOURS = 30;

// O banco já tem a série até 4 h atrás; o REST só conhece até a mesma abertura, então a primeira
// recuperação não acha nada para baixar e as velas seguintes precisam vir pelo stream.
async function seed(context: StreamContext, server: FakeBinanceStreamServer): Promise<void> {
  const first = hoursFrom(context.lastClosedOpenTime, -HOURS_BEFORE_LAST_CLOSED_AT_SEED_START);
  const seeded = Array.from({ length: SEEDED_HOURS }, (_unused, index) =>
    buildSeedCandle(hoursFrom(first, index)),
  );
  await context.repository.upsertCandles(seeded);
  const lastSeeded = hoursFrom(context.lastClosedOpenTime, -4);
  const history = Array.from({ length: SEEDED_HISTORY_HOURS + 1 - 4 }, (_unused, index) =>
    hoursFrom(lastSeeded, index - (SEEDED_HISTORY_HOURS - 4)),
  );
  server.setHistory({ symbol: SYMBOL, timeframe: TIMEFRAME, openTimes: history });
}

async function runChecks(databaseUrl: string, server: FakeBinanceStreamServer): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  await waitForSafeClock();
  const handle = openDatabase(databaseUrl);
  const context: StreamContext = {
    databaseUrl,
    repository: createCandleRepository(handle),
    server,
    lastClosedOpenTime: computeLastClosedOpenTime(),
  };
  let worker: WorkerProcess | undefined;
  try {
    await seed(context, server);
    worker = startWorker({ databaseUrl, restUrl: server.restUrl, streamUrl: server.streamUrl });
    await prepareScenario(context);
    await checkClosedCandleIsStoredAndNoiseIsIgnored(context, worker);
    await prepareScenario(context);
    await checkDropWithLostCandlesLeavesNoHole(context, worker);
    await prepareScenario(context);
    await checkSigtermDuringRecoveryExitsZeroFast(context, worker);
  } finally {
    if (worker !== undefined && !worker.hasExited()) {
      worker.terminate();
      await worker.exited;
    }
    await closeDatabase(handle);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  const server = startFakeBinanceStreamServer();
  try {
    await runChecks(temporary.url, server);
  } finally {
    await server.stop();
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  console.log('stream-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`stream-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
