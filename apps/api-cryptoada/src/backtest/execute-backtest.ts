// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus } from '@cryptoada/database';
import { createPositionTracker, createSentimentPicker } from '@cryptoada/run-recording';
import { createEngine, type EngineCandle } from '@cryptoada/strategy-engine';

import {
  BACKTEST_BATCH_SIZE,
  BACKTEST_ERROR_CODE,
  BACKTEST_OUTCOME_STATUS,
  BACKTEST_PHASE,
} from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type {
  BacktestCancelled,
  BacktestCompleted,
  BacktestOptions,
  BacktestOutcome,
} from './backtest.types.js';
import { computeBacktestMetrics } from './backtest-metrics.js';
import type { BacktestRunSession } from './backtest-database.types.js';
import { beginRun } from './begin-run.js';
import type { CandlePages } from './candle-stream.js';
import { createLoopState, runCandleLoop, type LoopDependencies } from './candle-loop.js';
import { loadBacktestContext, type BacktestContext } from './load-backtest-context.js';
import { createPhaseTimer } from './phase-timer.js';

export type ExecuteBacktestParams = {
  readonly session: BacktestRunSession;
  readonly runId: string;
  readonly options: BacktestOptions;
};

type Counts = { readonly processed: number; readonly batches: number };

function cancelled(runId: string, counts: Counts): BacktestCancelled {
  return {
    status: BACKTEST_OUTCOME_STATUS.CANCELLED,
    runId,
    processedCandles: counts.processed,
    batches: counts.batches,
  };
}

// Execução retomada sem nenhum candle novo: o fechamento que avalia a posição aberta vem do banco.
async function resolveLastClose(params: {
  readonly session: BacktestRunSession;
  readonly context: BacktestContext;
  readonly lastCandle: EngineCandle | undefined;
  readonly lastCandleTime: number | null;
}): Promise<string> {
  if (params.lastCandle !== undefined) return params.lastCandle.close;
  const from = params.lastCandleTime ?? params.context.periodStart;
  const [candle] = await params.session.findCandles({
    from,
    to: from + params.context.durationMilliseconds,
  });
  return candle?.close ?? params.context.setup.parameters.initialBalance;
}

async function finishRun(params: {
  readonly deps: LoopDependencies;
  readonly runId: string;
  readonly finalState: ReturnType<typeof createLoopState>;
}): Promise<BacktestCompleted | BacktestCancelled> {
  const { deps, runId, finalState } = params;
  const lastClose = await resolveLastClose({
    session: deps.session,
    context: deps.context,
    lastCandle: finalState.lastCandle,
    lastCandleTime: finalState.previousOpenTime,
  });
  const metrics = await deps.timer.measure(BACKTEST_PHASE.METRICS, () =>
    computeBacktestMetrics({
      session: deps.session,
      context: deps.context,
      finalState: finalState.engineState,
      lastClose,
    }),
  );
  const counts = { processed: finalState.processedCandles, batches: finalState.batches };
  if (!(await deps.session.completeRun(metrics))) {
    const status = await deps.session.readStatus();
    return refuseTerminalRun(runId, status ?? RUN_STATUS.FAILED, counts);
  }
  return {
    status: BACKTEST_OUTCOME_STATUS.COMPLETED,
    runId,
    processedCandles: counts.processed,
    batches: counts.batches,
    gapCandles: finalState.gapCandles,
    metrics,
    phases: deps.timer.totals(),
  };
}

type PreparedRun = {
  readonly deps: LoopDependencies;
  readonly state: ReturnType<typeof createLoopState>;
  readonly pages: CandlePages;
};

type PrepareResult =
  | { readonly kind: 'refused'; readonly status: RunStatus }
  | ({ readonly kind: 'ready' } & PreparedRun);

async function prepareRun(params: ExecuteBacktestParams): Promise<PrepareResult> {
  const { session, options } = params;
  const engine = options.engine ?? createEngine();
  const timer = createPhaseTimer();
  const batchSize = options.batchSize ?? BACKTEST_BATCH_SIZE;
  const blueprint = await timer.measure(BACKTEST_PHASE.LOAD, () => session.findRun());
  if (blueprint === undefined) {
    throw new BacktestError(BACKTEST_ERROR_CODE.RUN_NOT_FOUND, 'A execução deixou de existir.');
  }
  if (blueprint.run.status === RUN_STATUS.CANCELLED) {
    return { kind: 'refused', status: blueprint.run.status };
  }
  const context = loadBacktestContext({ blueprint, now: (options.now ?? Date.now)() });
  const begin = await timer.measure(BACKTEST_PHASE.LOAD, () =>
    beginRun({ session, context, engine, pageCandles: batchSize }),
  );
  if (begin.kind === 'refused') return begin;
  const source = context.setup.parameters.sentimentSource;
  const observations = await timer.measure(BACKTEST_PHASE.LOAD, () =>
    session.listSentiment({ source, until: context.periodEnd - 1 }),
  );
  return {
    kind: 'ready',
    pages: begin.pages,
    state: createLoopState({
      engineState: begin.engineState,
      previousOpenTime: begin.previousOpenTime,
    }),
    deps: {
      session,
      context,
      engine,
      pickSentiment: createSentimentPicker({ observations, source }),
      tracker: createPositionTracker(begin.engineState.wallet.position),
      timer,
      batchSize,
      reportProgress: (progress) => options.onProgress?.(progress),
    },
  };
}

function refuseTerminalRun(runId: string, status: RunStatus, counts: Counts): BacktestCancelled {
  if (status === RUN_STATUS.CANCELLED) return cancelled(runId, counts);
  throw new BacktestError(BACKTEST_ERROR_CODE.RUN_NOT_RUNNABLE, 'A execução já foi encerrada.');
}

export async function executeBacktest(params: ExecuteBacktestParams): Promise<BacktestOutcome> {
  const prepared = await prepareRun(params);
  const { runId } = params;
  if (prepared.kind === 'refused') {
    return refuseTerminalRun(runId, prepared.status, { processed: 0, batches: 0 });
  }
  const { deps, state, pages } = prepared;
  const loop = await runCandleLoop(deps, state, pages);
  if (loop.kind === 'stopped') {
    const counts = { processed: state.processedCandles, batches: state.batches };
    return refuseTerminalRun(runId, loop.status, counts);
  }
  return finishRun({ deps, runId, finalState: state });
}
