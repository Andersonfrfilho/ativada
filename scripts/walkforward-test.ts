// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkDeterminism } from './walkforward-test/check-determinism.js';
import { checkCancellation, checkResume } from './walkforward-test/check-interruptions.js';
import { checkIsolation } from './walkforward-test/check-isolation.js';
import { checkOverfitting } from './walkforward-test/check-overfitting.js';
import { checkRealSets, seedRealSets } from './walkforward-test/check-real-sets.js';
import { checkTiming } from './walkforward-test/check-timing.js';
import { TEMPORARY_DATABASE_PREFIX } from './walkforward-test/walkforward-test.constant.js';
import {
  closeWalkForwardTestContext,
  createWalkForwardTestContext,
  reportLine,
  seedStrategyVersion,
} from './walkforward-test/walkforward-test-context.js';
import { STRATEGY_CONFIG } from './walkforward-test/scenarios.js';

async function runSyntheticChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createWalkForwardTestContext(databaseUrl);
  try {
    const { overfit } = await checkOverfitting(context);
    const versionId = await seedStrategyVersion(context, STRATEGY_CONFIG);
    await checkDeterminism(context, versionId, overfit);
    await checkResume(context, versionId, overfit);
    await checkCancellation(context, versionId);
    await checkIsolation(context, overfit.runId);
    await checkTiming(context);
  } finally {
    await closeWalkForwardTestContext(context);
  }
}

async function runRealSetChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createWalkForwardTestContext(databaseUrl);
  try {
    await seedRealSets(context);
    await checkRealSets(context);
  } finally {
    await closeWalkForwardTestContext(context);
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
    `walkforward-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
