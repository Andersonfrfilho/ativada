// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  WalkForwardDatabase,
  WalkForwardRunSession,
} from '../../../apps/api-cryptoada/src/walk-forward/walk-forward-database.types.js';
import type {
  AppendResult,
  EngineCheckpoint,
  RunBatchWriter,
  RunRecord,
  RunStatus,
  StrategyVersionRecord,
  WalkForwardWindowInput,
} from '../../../packages/database/src/index.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
  type EquityPointDecision,
  type RunParametersInput,
  type StoredSentimentObservation,
  type StrategyConfigInput,
} from '../../../packages/strategy-engine/src/index.js';
import {
  appendRows,
  cloneResults,
  createEmptyResults,
  snapshotResults,
} from '../backtest/in-memory-backtest-results.fixture.js';
import type {
  StoredCheckpoint,
  StoredResults,
} from '../backtest/in-memory-backtest-types.fixture.js';

export const WALK_FORWARD_RUN_ID = '018f0000-0000-7000-8000-0000000000f1';
const FINAL_STATUSES: readonly RunStatus[] = ['completed', 'failed', 'cancelled'];
const TAMPERED_HASH = 'f'.repeat(64);
const TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: [],
  running: ['queued'],
  completed: ['running'],
  failed: ['queued', 'running'],
  cancelled: ['queued', 'running'],
};

export type WalkForwardScenario = {
  readonly candles: readonly EngineCandle[];
  readonly sentiment?: readonly StoredSentimentObservation[];
  readonly strategyConfig: StrategyConfigInput;
  readonly runParameters: RunParametersInput;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly kind?: string;
  readonly tamper?: 'run_hash' | 'config_hash';
  readonly hooks?: WalkForwardHooks;
  // O pedido gravado na linha da execução (`runs.request`); ausente = linha sem pedido.
  readonly request?: RunRecord['request'];
};

export type WalkForwardControls = { readonly cancel: () => void };

// Os ganchos são mutáveis de propósito: o teste simula a queda e, depois, a volta do processo.
export type WalkForwardHooks = {
  // Depois de cada COMMIT (1 = o primeiro): o cancelamento do usuário, ou a queda do processo, chega aqui.
  afterCommit?: (commit: number, controls: WalkForwardControls) => void;
  // Lança no `commit`-ésimo lote, antes de gravar, UMA vez: a queda no meio do lote.
  failAtCommit?: number;
  // Simula o processo que morreu: a falha não consegue gravar `failed`, e a execução fica `running`.
  isFailureUnrecordable?: boolean;
};

export type InMemoryWalkForwardState = {
  status: RunStatus;
  errorCode: string | undefined;
  metrics: unknown;
  progress: number;
  checkpoint: StoredCheckpoint | undefined;
  results: StoredResults;
  windows: Map<number, WalkForwardWindowInput>;
  commits: number;
  completedCalls: number;
};

export type InMemoryWalkForward = {
  readonly database: WalkForwardDatabase;
  readonly runId: string;
  readonly state: InMemoryWalkForwardState;
  readonly calls: { findCandles: number; inBatch: number; log: string[] };
  readonly snapshot: () => Record<string, unknown>;
};

function buildRecords(scenario: WalkForwardScenario): {
  readonly run: RunRecord;
  readonly version: StrategyVersionRecord;
} {
  const strategy = createStrategyVersion(scenario.strategyConfig);
  const setup = createRunSetup(scenario.runParameters);
  const run: RunRecord = {
    id: WALK_FORWARD_RUN_ID,
    strategyVersionId: '018f0000-0000-7000-8000-0000000000aa',
    kind: scenario.kind === undefined ? 'walk_forward' : 'backtest',
    status: 'queued',
    symbol: setup.parameters.symbol,
    timeframe: setup.parameters.timeframe,
    runParameters: structuredClone(setup.parameters),
    runHash: scenario.tamper === 'run_hash' ? TAMPERED_HASH : setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: scenario.periodStart,
    periodEnd: scenario.periodEnd,
    lastCandleTime: undefined,
    metrics: undefined,
    progress: 0,
    errorCode: undefined,
    migratedFromRunId: undefined,
    request: scenario.request === undefined ? undefined : structuredClone(scenario.request),
    createdAt: new Date(0),
    startedAt: undefined,
    goalId: undefined,
    goalOutcome: undefined,
    goalOutcomeCandleTime: undefined,
    finishedAt: undefined,
  };
  const version: StrategyVersionRecord = {
    id: run.strategyVersionId,
    strategyId: '018f0000-0000-7000-8000-0000000000bb',
    version: 1,
    config: structuredClone(strategy.config),
    configHash: scenario.tamper === 'config_hash' ? TAMPERED_HASH : strategy.configHash,
    createdAt: new Date(0),
  };
  return { run, version };
}

function transition(state: InMemoryWalkForwardState, to: RunStatus, errorCode?: string): boolean {
  if (!TRANSITIONS[to].includes(state.status)) return false;
  state.status = to;
  if (errorCode !== undefined) state.errorCode = errorCode;
  return true;
}

type Context = {
  readonly scenario: WalkForwardScenario;
  readonly memory: InMemoryWalkForward;
};

function createWriter(
  context: Context,
  stage: StoredResults,
  staged: Map<number, WalkForwardWindowInput>,
  writes: { count: number },
): RunBatchWriter {
  const { memory } = context;
  return {
    publishStepEvents: (): Promise<number> => Promise.resolve(0),
    appendAlerts: (): Promise<AppendResult> => Promise.resolve({ written: 0 }),
    recordGoalOutcome: (): Promise<boolean> => Promise.resolve(false),
    completeRun: (): Promise<boolean> => Promise.resolve(false),
    readStatus: (): Promise<RunStatus> => {
      memory.calls.log.push('status');
      return Promise.resolve(memory.state.status);
    },
    appendResults: (rows): Promise<AppendResult> => {
      writes.count += 1;
      memory.calls.log.push('append');
      return Promise.resolve({ written: appendRows(stage, rows) });
    },
    appendWindows: (rows): Promise<AppendResult> => {
      writes.count += 1;
      memory.calls.log.push('append-windows');
      let written = 0;
      for (const row of rows) {
        if (staged.has(row.windowIndex)) continue;
        staged.set(row.windowIndex, structuredClone(row));
        written += 1;
      }
      return Promise.resolve({ written });
    },
    saveCheckpoint: (params): Promise<boolean> => {
      const last = memory.state.checkpoint?.lastCandleTime;
      if (
        memory.state.status !== 'running' ||
        (last !== undefined && last >= params.lastCandleTime)
      ) {
        return Promise.resolve(false);
      }
      writes.count += 1;
      memory.calls.log.push('checkpoint');
      memory.state.checkpoint = {
        engineState: structuredClone(params.engineState),
        lastCandleTime: params.lastCandleTime,
        progress: params.progress,
      };
      return Promise.resolve(true);
    },
  };
}

async function inBatch<TResult>(
  context: Context,
  controls: WalkForwardControls,
  work: (writer: RunBatchWriter) => Promise<TResult>,
): Promise<TResult> {
  const { memory, scenario } = context;
  memory.calls.inBatch += 1;
  const stage = cloneResults(memory.state.results);
  const staged = new Map(memory.state.windows);
  const checkpointBefore = memory.state.checkpoint;
  try {
    const next = memory.state.commits + 1;
    const { hooks } = scenario;
    if (hooks?.failAtCommit === next) {
      delete hooks.failAtCommit;
      throw new Error('falha injetada no lote');
    }
    const writes = { count: 0 };
    const result = await work(createWriter(context, stage, staged, writes));
    memory.state.results = stage;
    memory.state.windows = staged;
    memory.state.progress = memory.state.checkpoint?.progress ?? memory.state.progress;
    if (writes.count === 0) return result;
    memory.state.commits = next;
    memory.calls.log.push('commit');
    hooks?.afterCommit?.(next, controls);
    return result;
  } catch (error: unknown) {
    memory.state.checkpoint = checkpointBefore;
    memory.calls.log.push('rollback');
    throw error;
  }
}

function createSession(
  context: Context,
  records: ReturnType<typeof buildRecords>,
): WalkForwardRunSession {
  const { memory, scenario } = context;
  const controls: WalkForwardControls = {
    cancel: () => void transition(memory.state, 'cancelled'),
  };
  return {
    findRun: () =>
      Promise.resolve({ ...records, run: { ...records.run, status: memory.state.status } }),
    startRun: () =>
      Promise.resolve(
        transition(memory.state, 'running')
          ? { isStarted: true as const }
          : { isStarted: false as const, status: memory.state.status },
      ),
    readStatus: () => Promise.resolve(memory.state.status),
    readCheckpoint: (): Promise<EngineCheckpoint | undefined> => {
      const { checkpoint } = memory.state;
      if (checkpoint === undefined) return Promise.resolve(undefined);
      return Promise.resolve(JSON.parse(JSON.stringify(checkpoint)) as EngineCheckpoint);
    },
    findCandles: (window): Promise<readonly EngineCandle[]> => {
      memory.calls.findCandles += 1;
      return Promise.resolve(
        scenario.candles.filter(
          (candle) => candle.openTime >= window.from && candle.openTime < window.to,
        ),
      );
    },
    listSentiment: () => Promise.resolve(scenario.sentiment ?? []),
    inBatch: (work) => inBatch(context, controls, work),
    readEquityPoints: () =>
      Promise.resolve(
        [...memory.state.results.equityPoints.values()]
          .sort((first, second) => first.candleTime - second.candleTime)
          .map((point): EquityPointDecision => ({
            candleOpenTime: point.candleTime,
            equity: point.equity,
            equityAtLow: point.equityAtLow,
            benchmark: point.benchmark,
          })),
      ),
    readWindows: () =>
      Promise.resolve(
        [...memory.state.windows.values()].sort(
          (first, second) => first.windowIndex - second.windowIndex,
        ),
      ),
    completeRun: (metrics): Promise<boolean> => {
      memory.state.completedCalls += 1;
      memory.state.metrics = structuredClone(metrics);
      memory.state.progress = 100;
      return Promise.resolve(transition(memory.state, 'completed'));
    },
    failRun: (errorCode): Promise<boolean> =>
      Promise.resolve(
        scenario.hooks?.isFailureUnrecordable === true
          ? false
          : transition(memory.state, 'failed', errorCode),
      ),
  };
}

export function createInMemoryWalkForward(scenario: WalkForwardScenario): InMemoryWalkForward {
  const records = buildRecords(scenario);
  const state: InMemoryWalkForwardState = {
    status: 'queued',
    errorCode: undefined,
    metrics: undefined,
    progress: 0,
    checkpoint: undefined,
    results: createEmptyResults(),
    windows: new Map(),
    commits: 0,
    completedCalls: 0,
  };
  const memory: InMemoryWalkForward = {
    runId: WALK_FORWARD_RUN_ID,
    state,
    calls: { findCandles: 0, inBatch: 0, log: [] },
    database: {
      attach: (runId) =>
        Promise.resolve(
          runId === WALK_FORWARD_RUN_ID ? createSession({ scenario, memory }, records) : undefined,
        ),
    },
    snapshot: () => ({
      ...snapshotResults(state.results),
      windows: [...state.windows.values()].sort(
        (first, second) => first.windowIndex - second.windowIndex,
      ),
      metrics: state.metrics,
      status: state.status,
    }),
  };
  return memory;
}

export function isFinalStatus(status: RunStatus): boolean {
  return FINAL_STATUSES.includes(status);
}
