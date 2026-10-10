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
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { TEMPORARY_DATABASE_PREFIX } from './backfill-test/backfill-test.constant.js';
import type { BackfillContext } from './backfill-test/backfill-test-context.js';
import { checkFearGreedSync } from './backfill-test/check-fear-greed.js';
import { checkHoleIsFilledAndRerunIsIdle } from './backfill-test/check-hole-and-rerun.js';
import { checkResumeAfterFailure } from './backfill-test/check-resume.js';
import { checkTwoYearsOfDailyAndHourly } from './backfill-test/check-two-years.js';
import { checkUnfillableGapIsReportedOnce } from './backfill-test/check-unfillable.js';
import { startFakeBinanceServer } from './backfill-test/fake-binance-server.js';

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const sql = new Bun.SQL(databaseUrl);
  const server = startFakeBinanceServer();
  const context: BackfillContext = {
    databaseUrl,
    sql,
    repository: createCandleRepository(handle),
    server,
  };
  try {
    await checkHoleIsFilledAndRerunIsIdle(context);
    await checkResumeAfterFailure(context);
    await checkTwoYearsOfDailyAndHourly(context);
    await checkUnfillableGapIsReportedOnce(context);
    await checkFearGreedSync(context);
  } finally {
    await server.stop();
    await sql.close();
    await closeDatabase(handle);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await runChecks(temporary.url);
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  console.log('backfill-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(
    `backfill-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
