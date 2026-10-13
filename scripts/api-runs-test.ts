// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import {
  computeStrategyLeadInCandles,
  createStrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import { buildTwoYearSyntheticSeries } from '../test/fixtures/backtest/synthetic-candles.fixture.js';
import { loadClassicScoreboard } from '../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { buildDailyCandles } from '../test/fixtures/walk-forward/daily-candles.fixture.js';
import { SCENARIO_START } from '../test/fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import {
  DAY_MILLISECONDS,
  HOUR_MILLISECONDS,
  TEMPORARY_DATABASE_PREFIX,
} from './api-runs-test/api-runs-test.constant.js';
import {
  createApiRunsContext,
  reportLine,
  seedCandles,
  type ApiRunsContext,
} from './api-runs-test/api-runs-test-context.js';
import { checkBacktestFlow, type SeriesWindow } from './api-runs-test/check-backtest-flow.js';
import { checkChartLoad } from './api-runs-test/check-chart-load.js';
import { checkDocumentation } from './api-runs-test/check-docs.js';
import { checkStrategyDelete } from './api-runs-test/check-strategy-delete.js';
import { checkExampleStrategy } from './api-runs-test/check-example-strategy.js';
import { checkIsolationOverHttp } from './api-runs-test/check-isolation.js';
import { checkTamperedCursor } from './api-runs-test/check-tampered-cursor.js';
import { checkWalkForwardAndStops } from './api-runs-test/check-walk-forward.js';

const WARM_UP_DAYS = 300;
const DAILY_CANDLES = WARM_UP_DAYS + 430;
const DAILY_SEED = 20_261_017;

async function seedMarket(context: ApiRunsContext): Promise<SeriesWindow> {
  const hourly = buildTwoYearSyntheticSeries();
  await seedCandles(context, hourly);
  await seedCandles(
    context,
    buildDailyCandles({
      count: DAILY_CANDLES,
      seed: DAILY_SEED,
      firstOpenTime: SCENARIO_START - WARM_UP_DAYS * DAY_MILLISECONDS,
    }),
  );
  const first = hourly[0];
  const last = hourly.at(-1);
  if (first === undefined || last === undefined) throw new Error('série sintética vazia');
  const leadIn = computeStrategyLeadInCandles(
    createStrategyVersion(loadClassicScoreboard()).config,
  );
  return {
    periodStart: first.openTime + leadIn * HOUR_MILLISECONDS,
    periodEnd: last.closeTime + 1,
  };
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const context = await createApiRunsContext(databaseUrl);
  try {
    const window = await seedMarket(context);
    const flow = await checkBacktestFlow(context, window);
    await checkExampleStrategy(context, window);
    await checkStrategyDelete(context);
    await checkIsolationOverHttp(context, flow, window);
    await checkWalkForwardAndStops(context, { classicVersionId: flow.versionId, window });
    await checkTamperedCursor(context);
    await checkDocumentation(context);
    await checkChartLoad(context);
  } finally {
    await context.stop();
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
    `api-runs-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
