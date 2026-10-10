// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS } from '@cryptoada/database';
import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  createSentimentPicker,
  parseJsonContainer,
  toRunResultRows,
  type PositionTracker,
  type SentimentPicker,
} from '@cryptoada/run-recording';
import {
  serializeEngineState,
  type Engine,
  type EngineCandle,
  type EngineState,
} from '@cryptoada/strategy-engine';

import { LIVE_COMMIT_OUTCOME, LIVE_PASS_KIND, LIVE_PROGRESS } from './live.constant.js';
import type {
  GapConfirmation,
  LiveCommitOutcome,
  LivePassOutcome,
  LiveRunSession,
} from './live-run.types.js';
import { loadLiveContext, type LiveContext } from './load-live-context.js';
import { resolveLiveCursor, type LiveCursor } from './resolve-live-cursor.js';

export type LivePassParams = {
  readonly session: LiveRunSession;
  readonly engine: Engine;
  readonly isGapConfirmed: GapConfirmation;
  readonly maxSteps: number;
};

type PassRun = LivePassParams & {
  readonly context: LiveContext;
  readonly pickSentiment: SentimentPicker;
  readonly tracker: PositionTracker;
};

function outcome(kind: LivePassOutcome['kind'], steps: number): LivePassOutcome {
  return { kind, steps };
}

function missingOpenTimes(params: {
  readonly previousOpenTime: number;
  readonly openTime: number;
  readonly durationMilliseconds: number;
}): number[] {
  const missing: number[] = [];
  const { durationMilliseconds } = params;
  for (let time = params.previousOpenTime + durationMilliseconds; time < params.openTime;) {
    missing.push(time);
    time += durationMilliseconds;
  }
  return missing;
}

// O estado é a verdade sobre o que já foi processado: o candle que a fonte repete (leitura atrasada, candle reentregue)
// é pulado sem tocar o motor nem o banco (ADR 0002 §a, `CANDLE_ALREADY_PROCESSED` = pule).
function isAlreadyProcessed(state: EngineState, candle: EngineCandle): boolean {
  const last = state.signal.lastCandleOpenTime;
  return last !== null && candle.openTime <= last;
}

function findUnconfirmedGap(run: PassRun, cursor: LiveCursor, candle: EngineCandle): number[] {
  if (cursor.previousOpenTime === null) return [];
  const openTimes = missingOpenTimes({
    previousOpenTime: cursor.previousOpenTime,
    openTime: candle.openTime,
    durationMilliseconds: run.context.durationMilliseconds,
  });
  if (openTimes.length === 0) return [];
  const { symbol, timeframe } = run.context.setup.parameters;
  return run.isGapConfirmed({ symbol, timeframe, openTimes }) ? [] : openTimes;
}

async function stepOnce(
  run: PassRun,
  cursor: LiveCursor,
  candle: EngineCandle,
): Promise<{ readonly commit: LiveCommitOutcome; readonly next: LiveCursor }> {
  const { context } = run;
  const { result } = advanceCandle({
    engine: run.engine,
    strategy: context.strategy,
    setup: context.setup,
    state: cursor.state,
    candle,
    previousOpenTime: cursor.previousOpenTime,
    durationMilliseconds: context.durationMilliseconds,
    pickSentiment: run.pickSentiment,
  });
  const buffer = createBatchBuffer();
  appendDecisions({ buffer, decisions: result.decisions, tracker: run.tracker });
  const commit = await run.session.commitStep({
    rows: toRunResultRows(buffer),
    checkpoint: {
      engineState: parseJsonContainer(serializeEngineState(result.state)),
      lastCandleTime: candle.openTime,
      progress: LIVE_PROGRESS,
    },
  });
  return { commit, next: { state: result.state, previousOpenTime: candle.openTime } };
}

function settle(commit: LiveCommitOutcome, steps: number): LivePassOutcome {
  if (commit === LIVE_COMMIT_OUTCOME.ALREADY_RECORDED) {
    return outcome(steps > 0 ? LIVE_PASS_KIND.ADVANCED : LIVE_PASS_KIND.IDLE, steps);
  }
  return outcome(LIVE_PASS_KIND.ENDED, steps);
}

async function stepThrough(
  run: PassRun,
  start: LiveCursor,
  candles: readonly EngineCandle[],
): Promise<LivePassOutcome> {
  let cursor = start;
  let steps = 0;
  for (const candle of candles) {
    if (isAlreadyProcessed(cursor.state, candle)) continue;
    const gap = findUnconfirmedGap(run, cursor, candle);
    if (gap.length > 0) {
      return { kind: LIVE_PASS_KIND.WAITING, steps, waitingFromOpenTime: gap[0] };
    }
    const stepped = await stepOnce(run, cursor, candle);
    if (stepped.commit !== LIVE_COMMIT_OUTCOME.COMMITTED) return settle(stepped.commit, steps);
    cursor = stepped.next;
    steps += 1;
  }
  return outcome(steps > 0 ? LIVE_PASS_KIND.ADVANCED : LIVE_PASS_KIND.IDLE, steps);
}

// Uma ronda de UMA simulação: do último candle gravado até o último candle fechado que o banco tem, um passo (uma
// transação) por candle. Não guarda nada entre rondas: o checkpoint é a única memória, então a retomada é a regra.
export async function runLivePass(params: LivePassParams): Promise<LivePassOutcome> {
  const blueprint = await params.session.findRun();
  if (blueprint === undefined || blueprint.run.status !== RUN_STATUS.RUNNING) {
    return outcome(LIVE_PASS_KIND.ENDED, 0);
  }
  const context = loadLiveContext(blueprint);
  const cursor = await resolveLiveCursor({ ...params, context });
  const from =
    cursor.previousOpenTime === null
      ? context.loadStart
      : cursor.previousOpenTime + context.durationMilliseconds;
  const candles = await params.session.findCandles({
    from,
    to: Number.MAX_SAFE_INTEGER,
    limit: params.maxSteps,
  });
  const last = candles.at(-1);
  if (last === undefined) return outcome(LIVE_PASS_KIND.IDLE, 0);
  const source = context.setup.parameters.sentimentSource;
  const observations = await params.session.listSentiment({ source, until: last.closeTime });
  const run: PassRun = {
    ...params,
    context,
    pickSentiment: createSentimentPicker({ observations, source }),
    tracker: createPositionTracker(cursor.state.wallet.position),
  };
  return stepThrough(run, cursor, candles);
}
