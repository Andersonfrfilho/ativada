// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createIntervalTimers } from '../../apps/api-cryptoada/src/runs/queue/interval-timers.js';
import { createRunQueueDispatcher } from '../../apps/api-cryptoada/src/runs/queue/run-queue-dispatcher.js';
import type { RunQueueDispatcher } from '../../apps/api-cryptoada/src/runs/queue/run-queue-dispatcher.types.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  createRunQueueRepository,
  createStrategyRepository,
  resolveUserBySubject,
  RUN_KIND,
  RUN_ORPHAN_POLICY,
  USER_RESOLUTION_STATUS,
  type DatabaseHandle,
  type OwnerScope,
  type RunOrphanPolicy,
  type RunRecord,
} from '../../packages/database/src/index.js';
import {
  computeStrategyLeadInCandles,
  createStrategyVersion,
  type EngineCandle,
} from '../../packages/strategy-engine/src/index.js';
import { buildTwoYearSyntheticSeries } from '../../test/fixtures/backtest/synthetic-candles.fixture.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { buildDailyCandles } from '../../test/fixtures/walk-forward/daily-candles.fixture.js';
import {
  SCENARIO_END,
  SCENARIO_START,
  SHORT_STRATEGY,
} from '../../test/fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import {
  closeBacktestTestContext,
  createBacktestRun,
  createBacktestTestContext,
  createTestRunner as createBacktestRunner,
  seedCandles as seedHourlyCandles,
  type BacktestTestContext,
} from '../backtest-test/backtest-test-context.js';
import {
  closeWalkForwardTestContext,
  createTestRunner as createWalkForwardRunner,
  createWalkForwardRun,
  createWalkForwardTestContext,
  seedCandles as seedDailyCandles,
  type WalkForwardTestContext,
} from '../walkforward-test/walkforward-test-context.js';
import {
  DAILY_CANDLES,
  DAILY_SEED,
  DAY_MILLISECONDS,
  HEARTBEAT_INTERVAL_MILLISECONDS,
  HEARTBEAT_TIMEOUT_SECONDS,
  HOUR_MILLISECONDS,
  LIGHT_BACKTEST_CANDLES,
  POLL_INTERVAL_MILLISECONDS,
  SUBJECT_PREFIX,
  SYMBOL,
  WARM_UP_DAYS,
} from './queue-test.constant.js';

export type QueueUser = {
  readonly subject: string;
  readonly scope: OwnerScope;
  readonly classicVersionId: string;
  readonly walkForwardVersionId: string;
};

export type BacktestWindow = { readonly periodStart: number; readonly periodEnd: number };

export type QueueTestContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly backtest: BacktestTestContext;
  readonly walkForward: WalkForwardTestContext;
  readonly light: BacktestWindow;
  readonly heavy: BacktestWindow;
};

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`queue-test: ${message}\n`);
}

async function seedMarket(
  context: BacktestTestContext,
  walkForward: WalkForwardTestContext,
): Promise<{ readonly light: BacktestWindow; readonly heavy: BacktestWindow }> {
  const hourly: EngineCandle[] = buildTwoYearSyntheticSeries();
  await seedHourlyCandles(context, hourly);
  await seedDailyCandles(
    walkForward,
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
  const periodStart = first.openTime + leadIn * HOUR_MILLISECONDS;
  return {
    light: { periodStart, periodEnd: periodStart + LIGHT_BACKTEST_CANDLES * HOUR_MILLISECONDS },
    heavy: { periodStart, periodEnd: last.closeTime + 1 },
  };
}

export async function createQueueTestContext(databaseUrl: string): Promise<QueueTestContext> {
  const backtest = await createBacktestTestContext(databaseUrl);
  const walkForward = await createWalkForwardTestContext(databaseUrl);
  const windows = await seedMarket(backtest, walkForward);
  return {
    databaseUrl,
    handle: backtest.handle,
    client: backtest.client,
    backtest,
    walkForward,
    ...windows,
  };
}

export async function closeQueueTestContext(context: QueueTestContext): Promise<void> {
  await closeWalkForwardTestContext(context.walkForward);
  await closeBacktestTestContext(context.backtest);
}

async function seedVersion(
  context: QueueTestContext,
  params: { readonly scope: OwnerScope; readonly config: unknown; readonly name: string },
): Promise<string> {
  const strategies = createStrategyRepository(context.handle);
  const strategy = await strategies.createStrategy(params.scope, {
    name: params.name,
    isExample: false,
  });
  const version = createStrategyVersion(params.config);
  const added = await strategies.addVersion(params.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('estratégia recém-criada não aceitou versão');
  return added.version.id;
}

export async function createQueueUser(context: QueueTestContext, name: string): Promise<QueueUser> {
  const subject = `${SUBJECT_PREFIX}-${name}`;
  const resolution = await resolveUserBySubject(context.handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  const { scope } = resolution;
  return {
    subject,
    scope,
    classicVersionId: await seedVersion(context, {
      scope,
      config: loadClassicScoreboard(),
      name: 'Placar',
    }),
    walkForwardVersionId: await seedVersion(context, {
      scope,
      config: SHORT_STRATEGY,
      name: 'Walk-forward',
    }),
  };
}

export function enqueueBacktest(
  context: QueueTestContext,
  params: { readonly user: QueueUser; readonly window: BacktestWindow },
): Promise<RunRecord> {
  return createBacktestRun(context.backtest, {
    symbol: SYMBOL,
    timeframe: '1h',
    ...params.window,
    owner: params.user,
    strategyVersionId: params.user.classicVersionId,
  });
}

const WALK_FORWARD_GRID = {
  parameters: [
    { path: 'rules.ema-cross.fastPeriod', values: [3, 5, 8, 10] },
    { path: 'rules.ema-cross.slowPeriod', values: [15, 20, 25] },
    { path: 'thresholds.buy', values: ['1', '1.5'] },
  ],
} as const;

export function enqueueWalkForward(context: QueueTestContext, user: QueueUser): Promise<RunRecord> {
  return createWalkForwardRun(context.walkForward, {
    strategyVersionId: user.walkForwardVersionId,
    symbol: SYMBOL,
    timeframe: '1d',
    periodStart: SCENARIO_START,
    periodEnd: SCENARIO_END,
    owner: user,
    request: { grid: WALK_FORWARD_GRID, minTradesPerWindow: 2 },
  });
}

export type TestDispatcherOptions = {
  readonly instanceId: string;
  readonly globalConcurrency: number;
  readonly orphanPolicy?: RunOrphanPolicy;
  // Cada execução entregue a uma thread desta instância, na ordem.
  readonly executed?: string[];
  // Tudo o que o despachante reportou como inesperado: o teste exige que fique vazio.
  readonly reported: unknown[];
};

// O despachante de verdade (fila no Postgres, threads de verdade) com tempos curtos para o teste.
export function createTestDispatcher(
  context: QueueTestContext,
  options: TestDispatcherOptions,
): RunQueueDispatcher {
  const backtestRunner = createBacktestRunner(context.backtest);
  const walkForwardRunner = createWalkForwardRunner(context.walkForward);
  const record = (runId: string): void => void options.executed?.push(runId);
  return createRunQueueDispatcher({
    queue: createRunQueueRepository(context.handle),
    executors: {
      [RUN_KIND.BACKTEST]: (runId) => {
        record(runId);
        return backtestRunner.run(runId);
      },
      [RUN_KIND.WALK_FORWARD]: (runId) => {
        record(runId);
        return walkForwardRunner.run(runId);
      },
    },
    terminateExecutors: async () => {
      await Promise.all([backtestRunner.terminateAll(), walkForwardRunner.terminateAll()]);
    },
    timers: createIntervalTimers(),
    config: {
      instanceId: options.instanceId,
      globalConcurrency: options.globalConcurrency,
      heartbeatIntervalMilliseconds: HEARTBEAT_INTERVAL_MILLISECONDS,
      heartbeatTimeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
      pollIntervalMilliseconds: POLL_INTERVAL_MILLISECONDS,
      releaseTimeoutMilliseconds: 1000,
      orphanPolicy: options.orphanPolicy ?? RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT,
    },
    reportUnexpectedError: (error) => options.reported.push(error),
  });
}
