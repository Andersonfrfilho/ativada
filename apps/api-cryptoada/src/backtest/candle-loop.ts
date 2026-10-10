// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunStatus } from '@cryptoada/database';
import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  parseJsonContainer,
  type BatchBuffer,
  type PositionTracker,
  type SentimentPicker,
} from '@cryptoada/run-recording';
import {
  serializeEngineState,
  type Engine,
  type EngineCandle,
  type EngineState,
} from '@cryptoada/strategy-engine';

import {
  BACKTEST_ERROR_CODE,
  BACKTEST_PHASE,
  BACKTEST_PROGRESS_BEFORE_COMPLETION,
  PERCENT,
} from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type { BacktestRunSession } from './backtest-database.types.js';
import type { CandlePages } from './candle-stream.js';
import { flushBatch } from './flush-batch.js';
import type { BacktestContext } from './load-backtest-context.js';
import type { PhaseTimer } from './phase-timer.js';

export type LoopDependencies = {
  readonly session: BacktestRunSession;
  readonly context: BacktestContext;
  readonly engine: Engine;
  readonly pickSentiment: SentimentPicker;
  readonly tracker: PositionTracker;
  readonly timer: PhaseTimer;
  readonly batchSize: number;
  readonly reportProgress: (progress: number) => void;
};

export type LoopState = {
  engineState: EngineState;
  previousOpenTime: number | null;
  processedCandles: number;
  gapCandles: number;
  batches: number;
  lastCandle: EngineCandle | undefined;
  buffer: BatchBuffer;
};

export type LoopResult =
  { readonly kind: 'finished' } | { readonly kind: 'stopped'; readonly status: RunStatus };

export function createLoopState(params: {
  readonly engineState: EngineState;
  readonly previousOpenTime: number | null;
}): LoopState {
  return {
    engineState: params.engineState,
    previousOpenTime: params.previousOpenTime,
    processedCandles: 0,
    gapCandles: 0,
    batches: 0,
    lastCandle: undefined,
    buffer: createBatchBuffer(),
  };
}

export function computeProgress(context: BacktestContext, candleOpenTime: number): number {
  const total = context.periodEnd - context.loadStart;
  if (total <= 0) return 0;
  const done = candleOpenTime + context.durationMilliseconds - context.loadStart;
  const percent = Math.floor((PERCENT * done) / total);
  return Math.min(BACKTEST_PROGRESS_BEFORE_COMPLETION, Math.max(0, percent));
}

// Candles que o banco não tem entre o anterior e este: a lacuna que o motor exige declarada com a contagem
// exata. Nunca se pula candle em silêncio.
function stepCandle(deps: LoopDependencies, state: LoopState, candle: EngineCandle): void {
  const { context } = deps;
  const { result, gapCandles } = advanceCandle({
    engine: deps.engine,
    strategy: context.strategy,
    setup: context.setup,
    state: state.engineState,
    candle,
    previousOpenTime: state.previousOpenTime,
    durationMilliseconds: context.durationMilliseconds,
    pickSentiment: deps.pickSentiment,
  });
  appendDecisions({ buffer: state.buffer, decisions: result.decisions, tracker: deps.tracker });
  state.engineState = result.state;
  state.previousOpenTime = candle.openTime;
  state.lastCandle = candle;
  state.processedCandles += 1;
  state.gapCandles += gapCandles;
}

async function commitBatch(deps: LoopDependencies, state: LoopState): Promise<LoopResult> {
  const { lastCandle } = state;
  if (lastCandle === undefined) return { kind: 'finished' };
  const progress = computeProgress(deps.context, lastCandle.openTime);
  const result = await deps.timer.measure(BACKTEST_PHASE.WRITE, () =>
    flushBatch({
      session: deps.session,
      buffer: state.buffer,
      checkpoint: {
        engineState: parseJsonContainer(serializeEngineState(state.engineState)),
        lastCandleTime: lastCandle.openTime,
        progress,
      },
    }),
  );
  if (result.kind === 'vanished') {
    throw new BacktestError(BACKTEST_ERROR_CODE.RUN_NOT_FOUND, 'A execução deixou de existir.');
  }
  if (result.kind === 'stopped') return result;
  state.batches += 1;
  state.buffer = createBatchBuffer();
  deps.reportProgress(progress);
  return { kind: 'finished' };
}

async function processPage(
  deps: LoopDependencies,
  state: LoopState,
  page: readonly EngineCandle[],
): Promise<LoopResult> {
  for (const candle of page) {
    deps.timer.measureSync(BACKTEST_PHASE.ENGINE, () => stepCandle(deps, state, candle));
    if (state.buffer.steps < deps.batchSize) continue;
    const committed = await commitBatch(deps, state);
    if (committed.kind === 'stopped') return committed;
  }
  return { kind: 'finished' };
}

// O laço do backtest: o MESMO `step` do ao vivo, candle a candle, gravando em lotes (ADR 0002 §a e §b).
export async function runCandleLoop(
  deps: LoopDependencies,
  state: LoopState,
  pages: CandlePages,
): Promise<LoopResult> {
  for (;;) {
    const next = await deps.timer.measure(BACKTEST_PHASE.LOAD, () => pages.next());
    if (next.done === true) break;
    const processed = await processPage(deps, state, next.value);
    if (processed.kind === 'stopped') return processed;
  }
  return state.buffer.steps > 0 ? commitBatch(deps, state) : { kind: 'finished' };
}
