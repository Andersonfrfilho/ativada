// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  advanceCandle,
  appendDecisions,
  createBatchBuffer,
  parseJsonContainer,
  toRunResultRows,
  type PositionTracker,
  type SentimentPicker,
} from '@ativada/run-recording';
import {
  serializeEngineState,
  type Engine,
  type EngineCandle,
  type EngineCommand,
  type EntryRiskScale,
  type StepResult,
} from '@ativada/strategy-engine';

import type { AlertInput, AnalystDecisionInput } from '@ativada/database';
import { buildGoalAlert } from './goal-alert.js';
import {
  buildGoalCommands,
  decideGoalStep,
  isWalletSettled,
  type GoalDecision,
  type GoalTracking,
} from './goal-step.js';
import { ANALYST_RECORD_MODE } from './analyst-live.constant.js';
import { decideShadowStep } from './analyst-step.js';
import { settleGovernedStep } from './govern-step.js';
import { LIVE_PROGRESS } from './live.constant.js';
import type {
  LiveAlertingSettings,
  LiveCommitOutcome,
  LiveGoalCommit,
  LiveRunSession,
} from './live-run.types.js';
import type { AnalystRunKit } from './load-analyst-context.js';
import type { LiveContext } from './load-live-context.js';
import type { LiveCursor } from './resolve-live-cursor.js';
import { collectStepAlerts, type HitRateReader } from './step-alerts.js';
import type { TeamRunKit } from './team-decision.js';
import { stepTeamOnce } from './team-step.js';

// A meta da simulação: o acompanhamento (lido do pedido) e se o desfecho já foi gravado, o que muda de um passo para o seguinte.
export type GoalProgress = {
  readonly tracking: GoalTracking;
  isOutcomeRecorded: boolean;
};

export type StepRun = {
  readonly session: LiveRunSession;
  readonly engine: Engine;
  readonly alerting?: LiveAlertingSettings | undefined;
  readonly context: LiveContext;
  readonly readHitRate: HitRateReader;
  readonly pickSentiment: SentimentPicker;
  readonly tracker: PositionTracker;
  readonly goal: GoalProgress | undefined;
  // A execução tem uma espera gravada: o primeiro passo que a atravessa a apaga, na mesma transação.
  readonly waiting: { isPending: boolean };
  // O analista de risco em sombra desta simulação nesta ronda; ausente = não pedido (ou fora da vela de 15 min).
  readonly analyst?: AnalystRunKit | undefined;
  // A execução cuja decisão vem da linha gravada de uma equipe de modelo (spec 015); ausente = execução de regra.
  readonly team?: TeamRunKit | undefined;
};

export type PassRunStep = { readonly commit: LiveCommitOutcome; readonly next: LiveCursor };

function advance(
  run: StepRun,
  params: { readonly cursor: LiveCursor; readonly candle: EngineCandle } & {
    readonly commands?: readonly EngineCommand[];
    readonly entryRiskScale?: EntryRiskScale;
  },
): StepResult {
  const { context } = run;
  return advanceCandle({
    engine: run.engine,
    strategy: context.strategy,
    setup: context.setup,
    state: params.cursor.state,
    candle: params.candle,
    previousOpenTime: params.cursor.previousOpenTime,
    durationMilliseconds: context.durationMilliseconds,
    pickSentiment: run.pickSentiment,
    commands: params.commands,
    entryRiskScale: params.entryRiskScale,
  }).result;
}

type Settled = { readonly result: StepResult; readonly decision: GoalDecision | undefined };

// O passo do candle. Com meta, o desfecho sai do patrimônio deste candle; decidido, o MESMO candle é refeito (o passo é puro)
// com a saída por meta — vender a posição e parar de entrar, agindo no fechamento e executando em t+1 — e só o refeito é gravado.
function settleCandle(run: StepRun, cursor: LiveCursor, candle: EngineCandle): Settled {
  const first = advance(run, { cursor, candle });
  const { goal } = run;
  if (goal === undefined || goal.isOutcomeRecorded) return { result: first, decision: undefined };
  const decision = decideGoalStep({
    tracking: goal.tracking,
    candle,
    equityPoint: first.decisions.equityPoint,
  });
  if (decision === undefined) return { result: first, decision };
  const commands = buildGoalCommands({
    runId: run.context.run.id,
    outcome: decision.outcome,
    candle,
  });
  return { result: advance(run, { cursor, candle, commands }), decision };
}

function buildGoalCommit(
  run: StepRun,
  params: { readonly settled: Settled; readonly candle: EngineCandle },
): LiveGoalCommit | undefined {
  const { goal } = run;
  if (goal === undefined) return undefined;
  const { decision, result } = params.settled;
  const isEnding = decision !== undefined || goal.isOutcomeRecorded;
  return {
    outcome:
      decision === undefined
        ? undefined
        : { outcome: decision.runOutcome, candleTime: params.candle.openTime },
    shouldComplete: isEnding && isWalletSettled(result.state),
  };
}

async function collectAlerts(
  run: StepRun,
  params: { readonly settled: Settled; readonly candle: EngineCandle },
): Promise<readonly AlertInput[]> {
  const { context } = run;
  const { result, decision } = params.settled;
  const signalAlerts = await collectStepAlerts({
    alerting: run.alerting,
    readHitRate: run.readHitRate,
    candle: params.candle,
    result,
    durationMilliseconds: context.durationMilliseconds,
  });
  if (run.goal === undefined || decision === undefined || run.alerting === undefined) {
    return signalAlerts;
  }
  const goalAlert = buildGoalAlert({
    tracking: run.goal.tracking,
    candle: params.candle,
    decision,
    run: { symbol: context.run.symbol, timeframe: context.run.timeframe },
  });
  return [...signalAlerts, goalAlert];
}

type Analysed = { readonly settled: Settled; readonly analyst: AnalystDecisionInput | undefined };

// O analista de risco do candle. Em sombra só observa o passo; no governar ele dá o teto da entrada e a saída por tempo, o
// MESMO candle é refeito com eles e só o refeito é gravado (junto com a linha da decisão), depois da meta.
async function settleAnalyst(
  run: StepRun,
  params: { readonly cursor: LiveCursor; readonly candle: EngineCandle; readonly settled: Settled },
): Promise<Analysed> {
  const { analyst } = run;
  const { cursor, candle, settled } = params;
  const step = { context: run.context, candle, result: settled.result };
  if (analyst === undefined) return { settled, analyst: undefined };
  if (analyst.mode === ANALYST_RECORD_MODE.SHADOW) {
    return { settled, analyst: await decideShadowStep(analyst, step) };
  }
  const governed = await settleGovernedStep({
    kit: analyst,
    step,
    isGoalEnded: settled.decision !== undefined || run.goal?.isOutcomeRecorded === true,
    redo: (inputs) => advance(run, { cursor, candle, ...inputs }),
  });
  return { settled: { ...settled, result: governed.result }, analyst: governed.record };
}

export async function stepOnce(
  run: StepRun,
  cursor: LiveCursor,
  candle: EngineCandle,
): Promise<PassRunStep> {
  if (run.team !== undefined) return stepTeamOnce({ ...run, team: run.team }, cursor, candle);
  const { settled, analyst } = await settleAnalyst(run, {
    cursor,
    candle,
    settled: settleCandle(run, cursor, candle),
  });
  const { result } = settled;
  const buffer = createBatchBuffer();
  appendDecisions({ buffer, decisions: result.decisions, tracker: run.tracker });
  const goal = buildGoalCommit(run, { settled, candle });
  const commit = await run.session.commitStep({
    alerts: await collectAlerts(run, { settled, candle }),
    rows: toRunResultRows(buffer),
    checkpoint: {
      engineState: parseJsonContainer(serializeEngineState(result.state)),
      lastCandleTime: candle.openTime,
      progress: LIVE_PROGRESS,
    },
    ...(goal === undefined ? {} : { goal }),
    ...(run.waiting.isPending ? { shouldClearWait: true } : {}),
    ...(analyst === undefined ? {} : { analyst }),
  });
  if (commit === 'committed') run.waiting.isPending = false;
  if (run.goal !== undefined && settled.decision !== undefined && commit === 'committed') {
    run.goal.isOutcomeRecorded = true;
  }
  return { commit, next: { state: result.state, previousOpenTime: candle.openTime } };
}
