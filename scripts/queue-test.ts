// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkCrashRecovery } from './queue-test/check-crash-recovery.js';
import { checkFairness } from './queue-test/check-fairness.js';
import { checkIsolationOverHttp } from './queue-test/check-isolation.js';
import { checkRestart } from './queue-test/check-restart.js';
import { checkTwoInstances } from './queue-test/check-two-instances.js';
import { checkUserLimits } from './queue-test/check-user-limits.js';
import { TEMPORARY_DATABASE_PREFIX } from './queue-test/queue-test.constant.js';
import {
  closeQueueTestContext,
  createQueueTestContext,
  reportLine,
} from './queue-test/queue-test-context.js';

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createQueueTestContext(databaseUrl);
  try {
    await checkUserLimits(context);
    await checkFairness(context);
    await checkTwoInstances(context);
    await checkCrashRecovery(context);
    await checkRestart(context);
    await checkIsolationOverHttp(context);
  } finally {
    await closeQueueTestContext(context);
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
  reportLine('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `queue-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
