// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import {
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '../packages/strategy-engine/src/index.js';
import {
  closeWalkForwardTestContext,
  createWalkForwardTestContext,
} from './walkforward-test/walkforward-test-context.js';
import { readCodeState } from './walk-forward-report/code-state.js';
import { readReportOptions } from './walk-forward-report/report-options.js';
import { readSourceCandles } from './walk-forward-report/read-source-candles.js';
import { renderReport } from './walk-forward-report/render-report.js';
import {
  DAY_MILLISECONDS,
  SCENARIOS,
  WORK_DATABASE_PREFIX,
} from './walk-forward-report/report.constant.js';
import type { ReportInput, ScenarioReport } from './walk-forward-report/report.types.js';
import {
  buildScenarioReport,
  type ScenarioSpec,
} from './walk-forward-report/run-scenario-report.js';

const LOOKBACK_DAYS = 730;

async function buildOnTemporaryDatabase(params: {
  readonly workUrl: string;
  readonly sourceUrl: string;
  readonly until: number;
  readonly spec: ScenarioSpec;
}): Promise<ScenarioReport> {
  const candles = await readSourceCandles({
    sourceUrl: params.sourceUrl,
    symbol: params.spec.symbol,
    timeframe: params.spec.timeframe,
    fromTime: params.until - LOOKBACK_DAYS * DAY_MILLISECONDS,
    cutoffTime: params.until,
  });
  const temporary = await createTemporaryDatabase(params.workUrl, WORK_DATABASE_PREFIX);
  try {
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    const context = await createWalkForwardTestContext(temporary.url);
    try {
      return await buildScenarioReport({ context, spec: params.spec, candles });
    } finally {
      await closeWalkForwardTestContext(context);
    }
  } finally {
    await dropTemporaryDatabase(params.workUrl, temporary.databaseName);
  }
}

async function main(): Promise<void> {
  const options = readReportOptions(Bun.argv.slice(2), Bun.env);
  const scenarios: ScenarioReport[] = [];
  for (const spec of SCENARIOS) {
    process.stdout.write(`walk-forward-report: ${spec.symbol} ${spec.timeframe}\n`);
    scenarios.push(await buildOnTemporaryDatabase({ ...options, spec }));
  }
  const code = await readCodeState();
  const input: ReportInput = {
    generatedAt: new Date().toISOString(),
    dataUntil: new Date(options.until).toISOString(),
    commit: code.commit,
    isTreeClean: code.isTreeClean,
    engineVersions: `${ENGINE_VERSION} / ${SIGNAL_ENGINE_VERSION} / ${METRICS_VERSION}`,
    scenarios,
  };
  await Bun.write(options.outputPath, renderReport(input));
  await Bun.write(options.jsonPath, `${JSON.stringify(input, null, 2)}\n`);
  process.stdout.write(`walk-forward-report: gravado ${options.outputPath}\n`);
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `walk-forward-report: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
