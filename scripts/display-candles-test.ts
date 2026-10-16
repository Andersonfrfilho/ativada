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
import { checkDisplayCandlesBackfillAndPurge } from './backfill-test/check-display-candles.js';
import { startFakeBinanceServer } from './backfill-test/fake-binance-server.js';

// Prova o backfill de 3m (90 dias) e a limpeza pelo cron real, num Postgres descartável e com a Binance falsa local.
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
    await checkDisplayCandlesBackfillAndPurge(context);
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
  console.log('display-candles-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(
    `display-candles-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
