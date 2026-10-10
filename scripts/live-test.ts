// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkApi } from './live-test/check-api.js';
import { checkAtomicStep } from './live-test/check-atomic-step.js';
import { checkClosedAccounts } from './live-test/check-closed-accounts.js';
import { checkDuplicates } from './live-test/check-duplicates.js';
import { checkStepEvents } from './live-test/check-events.js';
import { checkTypedFailures } from './live-test/check-failures.js';
import { checkGaps } from './live-test/check-gaps.js';
import { checkParity } from './live-test/check-parity.js';
import { checkRestart } from './live-test/check-restart.js';
import { checkTwoWorkers } from './live-test/check-two-workers.js';
import { TEMPORARY_DATABASE_PREFIX } from './live-test/live-test.constant.js';
import {
  closeLiveTestContext,
  createLiveTestContext,
  reportLine,
} from './live-test/live-test-context.js';

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createLiveTestContext(databaseUrl);
  try {
    await checkParity(context);
    await checkRestart(context);
    await checkAtomicStep(context);
    await checkDuplicates(context);
    await checkStepEvents(context);
    await checkClosedAccounts(context);
    await checkTwoWorkers(context);
    await checkGaps(context);
    await checkTypedFailures(context);
    await checkApi(context);
  } finally {
    await closeLiveTestContext(context);
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
    `live-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
