// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  BacktestDatabase,
  BacktestRunSession,
  RunBlueprint,
} from '../../../apps/api-cryptoada/src/backtest/backtest-database.types.js';
import type {
  AppendResult,
  EngineCheckpoint,
  RunBatchWriter,
  RunRecord,
  RunStatus,
  StrategyVersionRecord,
} from '../../../packages/database/src/index.js';
import {
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
  type EquityPointDecision,
  type MetricsClosedPosition,
  type StoredSentimentObservation,
} from '../../../packages/strategy-engine/src/index.js';
import { CLASSIC_STRATEGY } from '../strategy-engine/signal/classic-signals.fixture.js';
import {
  appendRows,
  cloneResults,
  createEmptyResults,
  snapshotResults,
} from './in-memory-backtest-results.fixture.js';
import type {
  InjectedFailure,
  InMemoryControls,
  InMemoryScenario,
  OperationLog,
  StoredCheckpoint,
  StoredResults,
} from './in-memory-backtest-types.fixture.js';
import loadClassicStrategy from '../strategy-engine/classic-scoreboard.strategy.json' with { type: 'json' };

export const IN_MEMORY_RUN_ID = '018f0000-0000-7000-8000-000000000001';
const FINAL_STATUSES: readonly RunStatus[] = ['completed', 'failed', 'cancelled'];
const TAMPERED_HASH = 'f'.repeat(64);

export type InMemoryBacktest = {
  readonly database: BacktestDatabase;
  readonly runId: string;
  readonly log: OperationLog;
  readonly calls: { findCandles: number; listSentiment: number; inBatch: number };
  readonly state: InMemoryState;
  readonly snapshot: () => Record<string, readonly unknown[]>;
};

export type InMemoryState = {
  status: RunStatus;
  errorCode: string | undefined;
  metrics: unknown;
  progress: number;
  checkpoint: StoredCheckpoint | undefined;
  results: StoredResults;
  commits: number;
};

export type BuildRunParams = {
  readonly scenario: InMemoryScenario;
  readonly runParameters: RunRecord['runParameters'];
  readonly runHash: string;
};

function buildBlueprint(params: BuildRunParams): RunBlueprint {
  const { scenario } = params;
  const first = scenario.candles[0];
  const run: RunRecord = {
    id: IN_MEMORY_RUN_ID,
    strategyVersionId: '018f0000-0000-7000-8000-0000000000aa',
    kind: scenario.runKind === undefined ? 'backtest' : 'live_paper',
    status: scenario.initialStatus ?? 'queued',
    symbol: first?.symbol ?? 'BTCUSDT',
    timeframe: first?.timeframe ?? '1h',
    runParameters: params.runParameters,
    runHash: scenario.tamper === 'run_hash' ? TAMPERED_HASH : params.runHash,
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
    request: undefined,
    createdAt: new Date(0),
    startedAt: undefined,
    finishedAt: undefined,
  };
  const version: StrategyVersionRecord = {
    id: run.strategyVersionId,
    strategyId: '018f0000-0000-7000-8000-0000000000bb',
    version: 1,
    config: structuredClone(scenario.strategy?.config ?? loadClassicStrategy),
    configHash:
      scenario.tamper === 'config_hash'
        ? TAMPERED_HASH
        : (scenario.strategy?.configHash ?? CLASSIC_STRATEGY.configHash),
    createdAt: new Date(0),
  };
  return { run, version };
}

function isFinal(status: RunStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

type Context = {
  readonly scenario: InMemoryScenario;
  readonly blueprint: RunBlueprint;
  readonly memory: InMemoryBacktest;
};

function shouldFail(
  failure: InjectedFailure | undefined,
  operation: InjectedFailure['operation'],
  batch: number,
): boolean {
  if (failure === undefined || failure.isSpent === true) return false;
  if (failure.operation !== operation || failure.batch !== batch) return false;
  failure.isSpent = true;
  return true;
}

function createWriter(context: Context, stage: StoredResults, batch: number): RunBatchWriter {
  const { memory, scenario } = context;
  const failure = scenario.hooks?.failure;
  let stagedCheckpoint: StoredCheckpoint | undefined;
  return {
    publishStepEvents: (): Promise<number> => Promise.resolve(0),
    readStatus: (): Promise<RunStatus> => {
      memory.log.push('status');
      return Promise.resolve(memory.state.status);
    },
    appendResults: (rows): Promise<AppendResult> => {
      memory.log.push('append');
      if (shouldFail(failure, 'appendResults', batch)) {
        return Promise.reject(new Error('falha injetada em appendResults'));
      }
      return Promise.resolve({ written: appendRows(stage, rows) });
    },
    appendWindows: (): Promise<AppendResult> => Promise.resolve({ written: 0 }),
    saveCheckpoint: (params): Promise<boolean> => {
      memory.log.push('checkpoint');
      if (shouldFail(failure, 'saveCheckpoint', batch)) {
        return Promise.reject(new Error('falha injetada em saveCheckpoint'));
      }
      const last = memory.state.checkpoint?.lastCandleTime;
      if (
        memory.state.status !== 'running' ||
        (last !== undefined && last >= params.lastCandleTime)
      ) {
        return Promise.resolve(false);
      }
      stagedCheckpoint = {
        engineState: structuredClone(params.engineState),
        lastCandleTime: params.lastCandleTime,
        progress: params.progress,
      };
      memory.state.checkpoint = stagedCheckpoint;
      return Promise.resolve(true);
    },
  };
}

// A transação do banco: o lote grava numa cópia e só um `work` que termina vira COMMIT; se lançar, a cópia e o
// checkpoint voltam ao que eram.
async function inBatch<TResult>(
  context: Context,
  controls: InMemoryControls,
  work: (writer: RunBatchWriter) => Promise<TResult>,
): Promise<TResult> {
  const { memory } = context;
  memory.calls.inBatch += 1;
  const stage = cloneResults(memory.state.results);
  const checkpointBefore = memory.state.checkpoint;
  const batch = memory.state.commits + 1;
  const writer = createWriter(context, stage, batch);
  let isWritten = false;
  try {
    const result = await work({
      ...writer,
      appendResults: async (rows) => {
        const appended = await writer.appendResults(rows);
        isWritten = true;
        return appended;
      },
    });
    memory.state.results = stage;
    memory.state.progress = memory.state.checkpoint?.progress ?? memory.state.progress;
    if (!isWritten) {
      memory.log.push('close');
      return result;
    }
    memory.state.commits += 1;
    memory.log.push('commit');
    context.scenario.hooks?.afterCommit?.(memory.state.commits, controls);
    return result;
  } catch (error: unknown) {
    memory.state.checkpoint = checkpointBefore;
    memory.log.push('rollback');
    throw error;
  }
}

function transition(memory: InMemoryBacktest, to: RunStatus, errorCode?: string): boolean {
  const { state } = memory;
  const allowed: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
    queued: [],
    running: ['queued'],
    completed: ['running'],
    failed: ['queued', 'running'],
    cancelled: ['queued', 'running'],
  };
  if (!allowed[to].includes(state.status)) return false;
  state.status = to;
  if (errorCode !== undefined) state.errorCode = errorCode;
  return true;
}

function createSession(context: Context): BacktestRunSession {
  const { memory, scenario, blueprint } = context;
  const controls: InMemoryControls = { cancel: () => void transition(memory, 'cancelled') };
  return {
    findRun: () =>
      Promise.resolve({ ...blueprint, run: { ...blueprint.run, status: memory.state.status } }),
    startRun: () =>
      Promise.resolve(
        transition(memory, 'running')
          ? { isStarted: true as const }
          : { isStarted: false as const, status: memory.state.status },
      ),
    readStatus: () => Promise.resolve(memory.state.status),
    readCheckpoint: (): Promise<EngineCheckpoint | undefined> => {
      const { checkpoint } = memory.state;
      if (checkpoint === undefined) return Promise.resolve(undefined);
      return Promise.resolve(
        JSON.parse(
          JSON.stringify({
            engineState: checkpoint.engineState,
            lastCandleTime: checkpoint.lastCandleTime,
            progress: checkpoint.progress,
          }),
        ),
      );
    },
    findCandles: (window): Promise<readonly EngineCandle[]> => {
      memory.calls.findCandles += 1;
      return Promise.resolve(
        scenario.candles.filter(
          (candle) => candle.openTime >= window.from && candle.openTime < window.to,
        ),
      );
    },
    listSentiment: (query): Promise<readonly StoredSentimentObservation[]> => {
      memory.calls.listSentiment += 1;
      return Promise.resolve(
        (scenario.sentiment ?? []).filter(
          (item) => item.observedAt <= query.until && item.createdAt <= query.until,
        ),
      );
    },
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
    readClosedPositions: () => Promise.resolve(readClosedPositions(memory.state.results)),
    completeRun: (metrics): Promise<boolean> => {
      memory.log.push('complete');
      if (shouldFail(scenario.hooks?.failure, 'completeRun', memory.state.commits)) {
        return Promise.reject(new Error('falha injetada em completeRun'));
      }
      memory.state.metrics = structuredClone(metrics);
      memory.state.progress = 100;
      return Promise.resolve(transition(memory, 'completed'));
    },
    failRun: (errorCode): Promise<boolean> => {
      if (scenario.hooks?.isFailureUnrecordable === true) return Promise.resolve(false);
      return Promise.resolve(transition(memory, 'failed', errorCode));
    },
  };
}

function readClosedPositions(results: StoredResults): MetricsClosedPosition[] {
  return [...results.positions.values()]
    .flatMap((position) =>
      position.status === 'closed' &&
      position.exitFee !== undefined &&
      position.netProfit !== undefined &&
      position.exitReason !== undefined &&
      position.closedCandleTime !== undefined
        ? [
            {
              openedCandleOpenTime: position.openedCandleTime,
              candleOpenTime: position.closedCandleTime,
              entryFee: position.entryFee,
              exitFee: position.exitFee,
              netProfit: position.netProfit,
              exitReason: position.exitReason,
            },
          ]
        : [],
    )
    .sort((first, second) => first.candleOpenTime - second.candleOpenTime);
}

export function createInMemoryBacktest(params: BuildRunParams): InMemoryBacktest {
  const blueprint = buildBlueprint(params);
  const state: InMemoryState = {
    status: blueprint.run.status,
    errorCode: undefined,
    metrics: undefined,
    progress: 0,
    checkpoint: undefined,
    results: createEmptyResults(),
    commits: 0,
  };
  const memory: InMemoryBacktest = {
    runId: IN_MEMORY_RUN_ID,
    log: [],
    calls: { findCandles: 0, listSentiment: 0, inBatch: 0 },
    state,
    snapshot: () => snapshotResults(state.results),
    database: {
      attach: (runId) =>
        Promise.resolve(runId === IN_MEMORY_RUN_ID ? createSession(context) : undefined),
    },
  };
  const context: Context = { scenario: params.scenario, blueprint, memory };
  return memory;
}

export { isFinal as isFinalStatus };
