// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { TEMPORARY_DATABASE_PREFIX } from './backtest-test/backtest-test.constant.js';
import {
  closeBacktestTestContext,
  createBacktestTestContext,
  reportLine,
} from './backtest-test/backtest-test-context.js';
import { checkGapInTheMiddle, checkResponsiveness } from './backtest-test/check-gap-and-load.js';
import { checkIsolation, checkInactiveOwnerDoesNotRun } from './backtest-test/check-isolation.js';
import {
  checkCancellation,
  checkDyingThreads,
  checkOrphans,
  checkTypedFailures,
} from './backtest-test/check-interruptions.js';
import { checkRealSets, seedRealSets } from './backtest-test/check-real-sets.js';
import { checkTwoYears, seedTwoYears } from './backtest-test/check-two-years.js';

async function runSyntheticChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createBacktestTestContext(databaseUrl);
  try {
    const window = await seedTwoYears(context);
    const reference = await checkTwoYears(context, window);
    await checkIsolation(context, reference.runId);
    await checkInactiveOwnerDoesNotRun(context, window);
    await checkResponsiveness(context, window);
    await checkCancellation(context, window);
    await checkTypedFailures(context, window);
    await checkDyingThreads(context, window);
    await checkOrphans(context, window, reference.persisted.digest);
    await checkGapInTheMiddle(context, window, reference.persisted);
  } finally {
    await closeBacktestTestContext(context);
  }
}

async function runRealSetChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createBacktestTestContext(databaseUrl);
  try {
    await seedRealSets(context);
    await checkRealSets(context);
  } finally {
    await closeBacktestTestContext(context);
  }
}

async function withTemporaryDatabase(
  adminUrl: string,
  run: (databaseUrl: string) => Promise<void>,
): Promise<void> {
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await run(temporary.url);
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  await withTemporaryDatabase(adminUrl, runSyntheticChecks);
  await withTemporaryDatabase(adminUrl, runRealSetChecks);
  reportLine('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `backtest-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
