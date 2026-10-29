// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { closeDatabase, openDatabase } from '../packages/database/src/index.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { startFakeBinanceStreamServer } from '../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import { assertCondition } from './identity-test/identity-test.error.js';
import { checkCircuitsAndBudget, checkScheduledReports } from './model-teams-test/check-reports.js';
import { checkQuestion } from './model-teams-test/check-question.js';
import { checkTeamRun } from './model-teams-test/check-team-run.js';
import {
  lastClosedOpenTime,
  reportCheck,
  seedCandles,
  seedOwner,
  startProviders,
  type Providers,
} from './model-teams-test/model-teams-context.js';
import {
  SHUTDOWN_BUDGET_MILLISECONDS,
  TEMPORARY_DATABASE_PREFIX,
} from './model-teams-test/model-teams-test.constant.js';
import { startWorker, type WorkerProcess } from './model-teams-test/worker-process.js';

async function checkShutdown(worker: WorkerProcess): Promise<void> {
  const startedAt = Date.now();
  worker.terminate();
  const code = await worker.exited;
  assertCondition(code === 0, `o worker deveria sair com 0 no SIGTERM, saiu com ${code}`);
  assertCondition(
    Date.now() - startedAt < SHUTDOWN_BUDGET_MILLISECONDS,
    'o worker passou do orçamento de encerramento',
  );
  reportCheck('SIGTERM: o worker sai com 0 dentro do orçamento');
}

async function runChecks(
  databaseUrl: string,
  providers: Providers,
  binance: ReturnType<typeof startFakeBinanceStreamServer>,
): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  let worker: WorkerProcess | undefined;
  try {
    const lastOpen = lastClosedOpenTime();
    await seedCandles(handle, lastOpen);
    const owner = await seedOwner(handle, client);
    worker = startWorker({
      databaseUrl,
      restUrl: binance.restUrl,
      streamUrl: binance.streamUrl,
      providers,
    });
    const context = { client, providers, lastOpen, worker };
    await checkScheduledReports(context);
    await checkQuestion({ handle, client, providers, worker, owner });
    await checkCircuitsAndBudget(context);
    await checkTeamRun({ handle, client, lastOpen });
    await checkShutdown(worker);
    worker = undefined;
  } finally {
    if (worker !== undefined) {
      worker.terminate();
      await worker.exited;
    }
    await client.close();
    await closeDatabase(handle);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  const binance = startFakeBinanceStreamServer();
  const providers = startProviders();
  try {
    await runChecks(temporary.url, providers, binance);
  } finally {
    await Promise.all([
      binance.stop(),
      providers.lucas.stop(),
      providers.nina.stop(),
      providers.olivia.stop(),
    ]);
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  console.log('model-teams-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(
    `model-teams-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
