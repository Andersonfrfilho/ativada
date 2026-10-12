// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createCandleRepository,
  createRunRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  openDatabase,
  resolveUserBySubject,
  RUN_KIND,
  USER_RESOLUTION_STATUS,
  type DatabaseHandle,
  type OwnerScope,
  type RunRecord,
} from '../../packages/database/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import { createBacktestDatabase } from '../../apps/api-ativada/src/backtest/create-backtest-database.js';
import type { BacktestDatabase } from '../../apps/api-ativada/src/backtest/backtest-database.types.js';
import { failBacktestRun } from '../../apps/api-ativada/src/backtest/run-backtest.js';
import {
  createBacktestThreadRunner,
  type BacktestThreadRunner,
} from '../../apps/api-ativada/src/backtest/backtest-thread-runner.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
} from '../../packages/strategy-engine/src/index.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  DAY_MILLISECONDS,
  EXCHANGE,
  SENTIMENT_SOURCE,
  THREAD_TIMEOUT_MILLISECONDS,
} from './backtest-test.constant.js';

export type TestOwner = { readonly subject: string; readonly scope: OwnerScope };

export type BacktestTestContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly database: BacktestDatabase;
  readonly owner: TestOwner;
  readonly other: TestOwner;
  readonly strategyVersionId: string;
  readonly progress: number[];
};

const WORKER_URL = new URL(
  '../../apps/api-ativada/src/backtest/backtest.worker.ts',
  import.meta.url,
).href;

async function resolveOwner(handle: DatabaseHandle, subject: string): Promise<TestOwner> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return { subject, scope: resolution.scope };
}

async function seedClassicVersion(handle: DatabaseHandle, owner: TestOwner): Promise<string> {
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: 'Placar clássico',
    isExample: true,
  });
  const version = createStrategyVersion(loadClassicScoreboard());
  const added = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('estratégia recém-criada não aceitou versão');
  return added.version.id;
}

export async function createBacktestTestContext(databaseUrl: string): Promise<BacktestTestContext> {
  const handle = openDatabase(databaseUrl);
  const owner = await resolveOwner(handle, 'subject-backtest-owner');
  const other = await resolveOwner(handle, 'subject-backtest-other');
  return {
    databaseUrl,
    handle,
    client: new Bun.SQL(databaseUrl),
    database: createBacktestDatabase(handle),
    owner,
    other,
    strategyVersionId: await seedClassicVersion(handle, owner),
    progress: [],
  };
}

export async function closeBacktestTestContext(context: BacktestTestContext): Promise<void> {
  await context.client.close();
  await closeDatabase(context.handle);
}

export type RunnerOptions = {
  readonly workerUrl?: string;
  readonly timeoutMilliseconds?: number;
  readonly shouldRecordFailures?: boolean;
  readonly onProgress?: (progress: number) => void;
  readonly extraEnvironment?: Readonly<Record<string, string>>;
};

// O corredor de verdade: a thread de produção contra o Postgres do teste.
export function createTestRunner(
  context: BacktestTestContext,
  options: RunnerOptions = {},
): BacktestThreadRunner {
  return createBacktestThreadRunner({
    workerUrl: options.workerUrl ?? WORKER_URL,
    workerEnvironment: { DATABASE_URL: context.databaseUrl, ...options.extraEnvironment },
    timeoutMilliseconds: options.timeoutMilliseconds ?? THREAD_TIMEOUT_MILLISECONDS,
    recordFailure: (failure) =>
      options.shouldRecordFailures === false
        ? Promise.resolve(false)
        : failBacktestRun({ database: context.database, ...failure }),
    onProgress: (event) => options.onProgress?.(event.progress),
  });
}

export async function seedCandles(
  context: BacktestTestContext,
  candles: readonly EngineCandle[],
): Promise<void> {
  const repository = createCandleRepository(context.handle, { now: () => Date.now() });
  await repository.upsertCandles(
    candles.map((candle) => ({
      exchange: EXCHANGE,
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      tradeCount: 1,
    })),
  );
}

// Fear & Greed diário de dois anos: o valor fica DISPONÍVEL 24 h depois do dia (a regra conservadora do cron).
export async function seedSentiment(
  context: BacktestTestContext,
  params: { readonly firstDay: number; readonly days: number },
): Promise<void> {
  const repository = createSentimentObservationRepository(context.handle);
  const rows = Array.from({ length: params.days }, (_unused, index) => {
    const day = params.firstDay + index * DAY_MILLISECONDS;
    const observedAt = day + DAY_MILLISECONDS;
    return {
      source: SENTIMENT_SOURCE,
      date: new Date(day).toISOString().slice(0, 10),
      fearGreed: 10 + ((index * 7) % 80),
      observedAt,
      createdAt: new Date(observedAt),
    };
  });
  await repository.appendObservations(rows);
}

export type NewRunParams = {
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly owner?: TestOwner;
  readonly strategyVersionId?: string;
};

export async function createBacktestRun(
  context: BacktestTestContext,
  params: NewRunParams,
): Promise<RunRecord> {
  const setup = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: params.symbol,
    timeframe: params.timeframe,
  });
  const owner = params.owner ?? context.owner;
  const run = await createRunRepository(context.handle).createRun(owner.scope, {
    strategyVersionId: params.strategyVersionId ?? context.strategyVersionId,
    kind: RUN_KIND.BACKTEST,
    symbol: params.symbol,
    timeframe: params.timeframe,
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    migratedFromRunId: undefined,
  });
  if (run === undefined) throw new Error('execução não foi criada');
  return run;
}

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`backtest-test: ${message}\n`);
}
