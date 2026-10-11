// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { createLiveTestContext, createLiveUser } from './live-test/live-test-context.js';
import {
  checkColdEvaluationLimits,
  checkCrudAndIsolation,
  checkEvaluation,
  seedEvaluationMarket,
} from './goals-test/check-api.js';
import { checkRestart, checkThreeOutcomes, reportGoals } from './goals-test/check-outcomes.js';
import { EVALUATION_PAIRS, TEMPORARY_DATABASE_PREFIX } from './goals-test/goals-test.constant.js';
import {
  closeGoalsTestContext,
  createGoalsTestContext,
  type GoalsTestContext,
} from './goals-test/goals-test-context.js';

async function runChecks(context: GoalsTestContext): Promise<void> {
  const a = await createLiveUser(context.live, 'goals-a');
  const b = await createLiveUser(context.live, 'goals-b');
  await seedEvaluationMarket(context);
  await checkCrudAndIsolation(context, { a, b });
  await checkEvaluation(context, b);
  await checkColdEvaluationLimits(context, { busy: a, exhausted: b });
  const scenarios = await checkThreeOutcomes(context);
  await checkRestart(context, scenarios);
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    Bun.env['MARKET_SYMBOLS'] = EVALUATION_PAIRS;
    const context = await createGoalsTestContext(await createLiveTestContext(temporary.url));
    try {
      await runChecks(context);
    } finally {
      await closeGoalsTestContext(context);
    }
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportGoals('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `goals-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
