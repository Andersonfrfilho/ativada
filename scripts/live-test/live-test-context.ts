// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createLiveRunRepository,
  createRunRepository,
  createStrategyRepository,
  resolveUserBySubject,
  RUN_KIND,
  RUN_STATUS,
  USER_RESOLUTION_STATUS,
  type DatabaseHandle,
  type JsonContainer,
  type OwnerScope,
  type RunRecord,
} from '../../packages/database/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  canonicalJson,
  computeStrategyLeadInCandles,
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
} from '../../packages/strategy-engine/src/index.js';
import type { GapPolicy } from '../../apps/worker-ativada/src/live/gap-policy.js';
import type {
  GapConfirmation,
  LiveAlertingSettings,
  LiveCommitOutcome,
  LiveEvaluator,
  LiveRunDatabase,
  LiveRunSession,
  LiveTickSummary,
} from '../../apps/worker-ativada/src/live/live-run.types.js';
import type { WorkerLogger } from '../../apps/worker-ativada/src/logging/worker-logger.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  closeBacktestTestContext,
  createBacktestTestContext,
  type BacktestTestContext,
  type TestOwner,
} from '../backtest-test/backtest-test-context.js';
import {
  EXCHANGE,
  HEARTBEAT_TIMEOUT_SECONDS,
  QUIET_TICKS,
  SUBJECT_PREFIX,
  TICK_PAUSE_MILLISECONDS,
  WAIT_TIMEOUT_MILLISECONDS,
} from './live-test.constant.js';
import { loadLiveSource } from './live-source.js';

const { createLiveEvaluator, createLiveRunDatabase } = await loadLiveSource();

export type LiveReference = {
  readonly rowsDigest: string;
  readonly engineStateJson: string;
  readonly lastCandleTime: number;
  readonly counts: Readonly<Record<string, number>>;
};

export type LiveTestContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly backtest: BacktestTestContext;
  // O que o backtest deixou por conjunto, para os demais checks compararem o ao vivo com ele.
  readonly references: Map<string, LiveReference>;
};

export type LiveUser = {
  readonly subject: string;
  readonly scope: OwnerScope;
  readonly versionId: string;
};

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`live-test: ${message}\n`);
}

export async function createLiveTestContext(databaseUrl: string): Promise<LiveTestContext> {
  const backtest = await createBacktestTestContext(databaseUrl);
  return {
    databaseUrl,
    handle: backtest.handle,
    client: backtest.client,
    backtest,
    references: new Map(),
  };
}

export async function closeLiveTestContext(context: LiveTestContext): Promise<void> {
  await closeBacktestTestContext(context.backtest);
}

export function ownerOf(context: LiveTestContext): LiveUser {
  const { owner, strategyVersionId } = context.backtest;
  return { subject: owner.subject, scope: owner.scope, versionId: strategyVersionId };
}

// Outro usuário, com a própria estratégia (cópia do Placar clássico): o teto e o isolamento são por dono.
export async function createLiveUser(context: LiveTestContext, name: string): Promise<LiveUser> {
  const subject = `${SUBJECT_PREFIX}-${name}`;
  const resolution = await resolveUserBySubject(context.handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  const strategies = createStrategyRepository(context.handle);
  const strategy = await strategies.createStrategy(resolution.scope, {
    name: 'Placar',
    isExample: false,
  });
  const version = createStrategyVersion(loadClassicScoreboard());
  const added = await strategies.addVersion(resolution.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(version.config)),
    configHash: version.configHash,
  });
  if (added === undefined) throw new Error('estratégia recém-criada não aceitou versão');
  return { subject, scope: resolution.scope, versionId: added.version.id };
}

export const LEAD_IN_CANDLES = computeStrategyLeadInCandles(
  createStrategyVersion(loadClassicScoreboard()).config,
);

export async function seedCandles(
  context: LiveTestContext,
  candles: readonly EngineCandle[],
  options: { readonly symbol?: string; readonly allowFuture?: boolean } = {},
): Promise<void> {
  const repository = createCandleRepository(context.handle, {
    now:
      options.allowFuture === true
        ? (): number => Number.MAX_SAFE_INTEGER / 2
        : (): number => Date.now(),
  });
  await repository.upsertCandles(
    candles.map((candle) => ({
      exchange: EXCHANGE,
      symbol: options.symbol ?? candle.symbol,
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

export type NewLiveRun = {
  readonly symbol: string;
  readonly timeframe: '15m' | '1h' | '1d';
  readonly periodStart: number;
  readonly user?: LiveUser;
  // O que a API grava em `runs.request` (por exemplo, o pedido do analista de risco em sombra).
  readonly request?: JsonContainer;
};

export async function createLiveRun(
  context: LiveTestContext,
  params: NewLiveRun,
): Promise<RunRecord> {
  const user = params.user ?? ownerOf(context);
  const setup = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: params.symbol,
    timeframe: params.timeframe,
  });
  const run = await createRunRepository(context.handle).createRun(user.scope, {
    strategyVersionId: user.versionId,
    kind: RUN_KIND.LIVE_PAPER,
    symbol: params.symbol,
    timeframe: params.timeframe,
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: params.periodStart,
    periodEnd: undefined,
    migratedFromRunId: undefined,
    ...(params.request === undefined ? {} : { request: params.request }),
  });
  if (run === undefined) throw new Error('execução não foi criada');
  return run;
}

export async function cancelRun(
  context: LiveTestContext,
  params: { readonly runId: string; readonly user?: LiveUser },
): Promise<void> {
  const scope = params.user?.scope ?? context.backtest.owner.scope;
  await createRunRepository(context.handle).transitionRun(scope, {
    runId: params.runId,
    to: RUN_STATUS.CANCELLED,
  });
}

export type RunProgress = {
  readonly status: string;
  readonly claimedBy: string | null;
  readonly lastCandleTime: number | undefined;
  readonly errorCode: string | null;
};

type ProgressRow = {
  readonly status: string;
  readonly claimed_by: string | null;
  readonly last_candle_time: string | null;
  readonly error_code: string | null;
};

export async function readProgress(context: LiveTestContext, runId: string): Promise<RunProgress> {
  const rows: unknown = await context.client.unsafe(
    'SELECT status, claimed_by, last_candle_time::text, error_code FROM runs WHERE id = $1',
    [runId],
  );
  const row = (rows as readonly ProgressRow[])[0];
  if (row === undefined) throw new Error('execução inexistente');
  return {
    status: row.status,
    claimedBy: row.claimed_by,
    errorCode: row.error_code,
    lastCandleTime: row.last_candle_time === null ? undefined : Number(row.last_candle_time),
  };
}

export async function waitFor(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  while (!(await condition())) {
    assertCondition(Date.now() < deadline, `tempo esgotado: ${description}`);
    await Bun.sleep(TICK_PAUSE_MILLISECONDS);
  }
}

export function digestOf(value: unknown): string {
  return new Bun.CryptoHasher('sha256')
    .update(canonicalJson(JSON.parse(JSON.stringify(value))))
    .digest('hex');
}

export type TestLogEntry = { readonly level: string; readonly message: string };

export type ProductionEvaluator = {
  readonly evaluator: LiveEvaluator;
  readonly entries: TestLogEntry[];
  // Passos gravados por esta instância, por execução.
  readonly committed: Map<string, number>;
};

export type EvaluatorOptions = {
  readonly instanceId: string;
  readonly isGapConfirmed?: GapConfirmation;
  readonly gapPolicy?: GapPolicy;
  readonly heartbeatTimeoutSeconds?: number;
  readonly maxStepsPerPass?: number;
  readonly alerting?: LiveAlertingSettings;
  // Roda antes de cada passo ser gravado (por exemplo, apagar a conta no meio).
  readonly beforeCommit?: (runId: string) => Promise<void>;
};

function countingDatabase(
  inner: LiveRunDatabase,
  committed: Map<string, number>,
  beforeCommit: EvaluatorOptions['beforeCommit'],
): LiveRunDatabase {
  return {
    attach: async (runId): Promise<LiveRunSession | undefined> => {
      const session = await inner.attach(runId);
      if (session === undefined) return undefined;
      return {
        ...session,
        commitStep: async (commit): Promise<LiveCommitOutcome> => {
          await beforeCommit?.(runId);
          const outcome = await session.commitStep(commit);
          if (outcome === 'committed') committed.set(runId, (committed.get(runId) ?? 0) + 1);
          return outcome;
        },
      };
    },
  };
}

// O avaliador de PRODUÇÃO (banco de verdade, motor de verdade); só o relógio de batimento é curto.
export function createProductionEvaluator(
  context: LiveTestContext,
  options: EvaluatorOptions,
): ProductionEvaluator {
  const entries: TestLogEntry[] = [];
  const write =
    (level: string) =>
    (message: string): void =>
      void entries.push({ level, message });
  const logger: WorkerLogger = { info: write('info'), warn: write('warn'), error: write('error') };
  const committed = new Map<string, number>();
  const evaluator = createLiveEvaluator({
    claims: createLiveRunRepository(context.handle),
    database: countingDatabase(openLiveDatabase(context), committed, options.beforeCommit),
    instanceId: options.instanceId,
    heartbeatTimeoutSeconds: options.heartbeatTimeoutSeconds ?? HEARTBEAT_TIMEOUT_SECONDS,
    isGapConfirmed: options.isGapConfirmed ?? ((): boolean => false),
    logger,
    ...(options.maxStepsPerPass === undefined ? {} : { maxStepsPerPass: options.maxStepsPerPass }),
    ...(options.alerting === undefined ? {} : { alerting: options.alerting }),
    ...(options.gapPolicy === undefined ? {} : { gapPolicy: options.gapPolicy }),
  });
  return { evaluator, entries, committed };
}

export function openLiveDatabase(context: LiveTestContext): LiveRunDatabase {
  return createLiveRunDatabase({ handle: context.handle, exchange: EXCHANGE });
}

export function errorsOf(entries: readonly TestLogEntry[]): string[] {
  return entries.filter((entry) => entry.level === 'error').map((entry) => entry.message);
}

// Rondas até `QUIET_TICKS` seguidas sem passo nem execução nova: a simulação alcançou o último candle fechado.
export async function tickUntilQuiet(evaluator: LiveEvaluator): Promise<LiveTickSummary> {
  const totals = { claimed: 0, evaluated: 0, steps: 0, ended: 0, failed: 0 };
  let quiet = 0;
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  while (quiet < QUIET_TICKS) {
    assertCondition(Date.now() < deadline, 'o avaliador não ficou ocioso');
    const summary = await evaluator.tick();
    totals.claimed += summary.claimed;
    totals.evaluated += summary.evaluated;
    totals.steps += summary.steps;
    totals.ended += summary.ended;
    totals.failed += summary.failed;
    quiet = summary.steps === 0 && summary.claimed === 0 ? quiet + 1 : 0;
  }
  return totals;
}

export type { TestOwner };
