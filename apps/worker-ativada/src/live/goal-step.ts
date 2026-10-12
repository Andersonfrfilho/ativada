// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME, type GoalRunOutcome, type RunRecord } from '@ativada/database';
import {
  COMMAND_KIND,
  COMMAND_REASON,
  computeGoalLevels,
  formatEngineDecimal,
  GOAL_OUTCOME,
  GoalInputError,
  goalFinalValue,
  judgeGoalStep,
  MILLISECONDS_PER_DAY,
  parseGoalSpec,
  toEngineDecimal,
  type CommandReason,
  type EngineCandle,
  type EngineCommand,
  type EngineState,
  type EquityPointDecision,
  type GoalLevels,
  type GoalOutcome,
  type GoalSpec,
  type RunSetup,
} from '@ativada/strategy-engine';

import { LIVE_ERROR_CODE } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';

// Tudo o que o passo precisa saber da meta, lido UMA vez do que a execução gravou: a meta é uma fotografia no pedido da
// execução (alterar a meta depois não muda uma simulação em andamento).
export type GoalTracking = {
  readonly spec: GoalSpec;
  readonly levels: GoalLevels;
  readonly horizonCandles: number;
  readonly periodStart: number;
  readonly durationMilliseconds: number;
  readonly initialBalance: string;
};

export type GoalDecision = {
  readonly outcome: GoalOutcome;
  readonly runOutcome: GoalRunOutcome;
  // O que o saldo valia no desfecho, em texto exato: o vale na perda máxima, o fechamento no alvo e no prazo.
  readonly finalValue: string;
};

const RUN_OUTCOME_BY_OUTCOME: Readonly<Record<GoalOutcome, GoalRunOutcome>> = {
  [GOAL_OUTCOME.REACHED]: GOAL_RUN_OUTCOME.REACHED,
  [GOAL_OUTCOME.STOPPED]: GOAL_RUN_OUTCOME.STOPPED,
  [GOAL_OUTCOME.EXPIRED]: GOAL_RUN_OUTCOME.EXPIRED,
};

const COMMAND_REASON_BY_OUTCOME: Readonly<Record<GoalOutcome, CommandReason>> = {
  [GOAL_OUTCOME.REACHED]: COMMAND_REASON.GOAL_REACHED,
  [GOAL_OUTCOME.STOPPED]: COMMAND_REASON.GOAL_MAX_LOSS,
  [GOAL_OUTCOME.EXPIRED]: COMMAND_REASON.GOAL_EXPIRED,
};

function readGoalSnapshot(request: RunRecord['request']): unknown {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return undefined;
  return Object.getOwnPropertyDescriptor(request, 'goal')?.value;
}

export type LoadGoalTrackingParams = {
  readonly run: RunRecord;
  readonly setup: RunSetup;
  readonly durationMilliseconds: number;
};

// Execução sem meta não tem acompanhamento. Atrelada a uma meta, a fotografia gravada no pedido tem de valer: o motor a
// confere de novo, e dado que não passa é execução inválida (falha tipada), nunca um acompanhamento adivinhado.
export function loadGoalTracking(params: LoadGoalTrackingParams): GoalTracking | undefined {
  const { run, setup, durationMilliseconds } = params;
  if (run.goalId === undefined) return undefined;
  let spec: GoalSpec;
  try {
    spec = parseGoalSpec(readGoalSnapshot(run.request));
  } catch (error: unknown) {
    if (!(error instanceof GoalInputError)) throw error;
    throw new LiveRunError(LIVE_ERROR_CODE.INVALID_RUN_DATA, 'A meta da execução não é válida.');
  }
  return {
    spec,
    levels: computeGoalLevels({
      initial: toEngineDecimal(setup.parameters.initialBalance),
      goal: spec,
    }),
    horizonCandles: (spec.horizonDays * MILLISECONDS_PER_DAY) / durationMilliseconds,
    periodStart: run.periodStart,
    durationMilliseconds,
    initialBalance: setup.parameters.initialBalance,
  };
}

export type DecideGoalStepParams = {
  readonly tracking: GoalTracking;
  readonly candle: EngineCandle;
  readonly equityPoint: EquityPointDecision | null;
};

// O veredito deste candle (a mesma regra da avaliação histórica): os candles de aquecimento, antes do início da meta, e os
// sem ponto de patrimônio não decidem nada. O prazo vence no último candle da meta, ou no primeiro que chegar depois dele.
export function decideGoalStep(params: DecideGoalStepParams): GoalDecision | undefined {
  const { tracking, candle, equityPoint } = params;
  const candlesElapsed =
    (candle.openTime - tracking.periodStart) / tracking.durationMilliseconds + 1;
  if (candlesElapsed < 1 || equityPoint === null) return undefined;
  const point = {
    equity: toEngineDecimal(equityPoint.equity),
    equityAtLow: toEngineDecimal(equityPoint.equityAtLow),
  };
  const outcome = judgeGoalStep({
    levels: tracking.levels,
    point,
    candlesElapsed,
    horizonCandles: tracking.horizonCandles,
  });
  if (outcome === undefined) return undefined;
  return {
    outcome,
    runOutcome: RUN_OUTCOME_BY_OUTCOME[outcome],
    finalValue: formatEngineDecimal(goalFinalValue(outcome, point)),
  };
}

export type BuildGoalCommandsParams = {
  readonly runId: string;
  readonly outcome: GoalOutcome;
  readonly candle: EngineCandle;
};

// A saída por meta age no FECHAMENTO do candle do desfecho e executa em t+1 (ADR 0002 §h): vende a posição e para de
// entrar. Os ids levam a execução e o desfecho, então reentregar o passo nunca repete a ordem.
export function buildGoalCommands(params: BuildGoalCommandsParams): EngineCommand[] {
  const { runId, outcome, candle } = params;
  const reason = COMMAND_REASON_BY_OUTCOME[outcome];
  return [COMMAND_KIND.EXIT_POSITION, COMMAND_KIND.HALT].map((kind) => ({
    commandId: `goal:${runId}:${outcome}:${kind}`,
    issuedAt: candle.closeTime,
    kind,
    reason,
  }));
}

// Sem posição nem ordem pendente: a saída por meta já se completou e a simulação pode ser encerrada.
export function isWalletSettled(state: EngineState): boolean {
  return state.wallet.position === null && state.wallet.pendingOrder === null;
}
