// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createCandleRepository,
  createRunRepository,
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
import { createWalkForwardDatabase } from '../../apps/api-cryptoada/src/walk-forward/create-walk-forward-database.js';
import { failWalkForwardRun } from '../../apps/api-cryptoada/src/walk-forward/run-walk-forward.js';
import type { WalkForwardRequest } from '../../apps/api-cryptoada/src/walk-forward/walk-forward.types.js';
import type { WalkForwardDatabase } from '../../apps/api-cryptoada/src/walk-forward/walk-forward-database.types.js';
import {
  createWalkForwardThreadRunner,
  type WalkForwardThreadRunner,
} from '../../apps/api-cryptoada/src/walk-forward/walk-forward-thread-runner.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
  type StrategyConfigInput,
} from '../../packages/strategy-engine/src/index.js';
import {
  EXCHANGE,
  SENTIMENT_SOURCE,
  THREAD_TIMEOUT_MILLISECONDS,
} from './walkforward-test.constant.js';

export type TestOwner = { readonly subject: string; readonly scope: OwnerScope };

export type WalkForwardTestContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly database: WalkForwardDatabase;
  readonly owner: TestOwner;
  readonly other: TestOwner;
};

const WORKER_URL = new URL(
  '../../apps/api-cryptoada/src/walk-forward/walk-forward.worker.ts',
  import.meta.url,
).href;

async function resolveOwner(handle: DatabaseHandle, subject: string): Promise<TestOwner> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return { subject, scope: resolution.scope };
}

export async function createWalkForwardTestContext(
  databaseUrl: string,
): Promise<WalkForwardTestContext> {
  const handle = openDatabase(databaseUrl);
  return {
    databaseUrl,
    handle,
    client: new Bun.SQL(databaseUrl),
    database: createWalkForwardDatabase(handle),
    owner: await resolveOwner(handle, 'subject-walkforward-owner'),
    other: await resolveOwner(handle, 'subject-walkforward-other'),
  };
}

export async function closeWalkForwardTestContext(context: WalkForwardTestContext): Promise<void> {
  await context.client.close();
  await closeDatabase(context.handle);
}

export type RunnerOptions = {
  readonly threads?: number;
  readonly timeoutMilliseconds?: number;
  readonly onProgress?: (progress: number) => void;
};

// O corredor de verdade: a thread coordenadora de produção contra o Postgres do teste, com `threads` de busca.
export function createTestRunner(
  context: WalkForwardTestContext,
  options: RunnerOptions = {},
): WalkForwardThreadRunner {
  return createWalkForwardThreadRunner({
    workerUrl: WORKER_URL,
    workerEnvironment: {
      DATABASE_URL: context.databaseUrl,
      WALK_FORWARD_THREADS: String(options.threads ?? 2),
    },
    timeoutMilliseconds: options.timeoutMilliseconds ?? THREAD_TIMEOUT_MILLISECONDS,
    recordFailure: (failure) => failWalkForwardRun({ database: context.database, ...failure }),
    onProgress: (event) => options.onProgress?.(event.progress),
  });
}

export async function seedCandles(
  context: WalkForwardTestContext,
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

export async function seedStrategyVersion(
  context: WalkForwardTestContext,
  config: StrategyConfigInput,
  owner: TestOwner = context.owner,
): Promise<string> {
  const strategies = createStrategyRepository(context.handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: 'Walk-forward',
    isExample: false,
  });
  const version = createStrategyVersion(config);
  const added = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('estratégia recém-criada não aceitou versão');
  return added.version.id;
}

export type NewRunParams = {
  readonly strategyVersionId: string;
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly costs?: { readonly feeRate: string; readonly slippageRate: string };
  readonly owner?: TestOwner;
  // O pedido (grade e janelas) mora na linha da execução; a thread o lê de lá.
  readonly request?: WalkForwardRequest;
};

export async function createWalkForwardRun(
  context: WalkForwardTestContext,
  params: NewRunParams,
): Promise<RunRecord> {
  const setup = createRunSetup({
    schemaVersion: 1,
    symbol: params.symbol,
    timeframe: params.timeframe,
    sentimentSource: SENTIMENT_SOURCE,
    ...params.costs,
  });
  const owner = params.owner ?? context.owner;
  const run = await createRunRepository(context.handle).createRun(owner.scope, {
    strategyVersionId: params.strategyVersionId,
    kind: RUN_KIND.WALK_FORWARD,
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
    request:
      params.request === undefined ? undefined : parseJsonContainer(JSON.stringify(params.request)),
  });
  if (run === undefined) throw new Error('execução não foi criada');
  return run;
}

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`walkforward-test: ${message}\n`);
}

export type Scenario = {
  readonly versionId: string;
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly request: WalkForwardRequest;
  readonly costs?: { readonly feeRate: string; readonly slippageRate: string };
};

export async function newRun(
  context: WalkForwardTestContext,
  scenario: Scenario,
): Promise<RunRecord> {
  return createWalkForwardRun(context, {
    strategyVersionId: scenario.versionId,
    symbol: scenario.symbol,
    timeframe: scenario.timeframe,
    periodStart: scenario.periodStart,
    periodEnd: scenario.periodEnd,
    ...(scenario.costs === undefined ? {} : { costs: scenario.costs }),
    request: scenario.request,
  });
}
