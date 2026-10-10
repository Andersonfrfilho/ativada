// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import { GOAL_OUTCOME, type GoalOutcome } from './goal.constant.js';
import type { GoalLevels, GoalPoint } from './goal.types.js';

// O veredito de UM candle, sem olhar o prazo. No mesmo candle a perda máxima (medida no vale) vale antes do alvo (medido no
// fechamento): o lado pior, como o stop e o alvo do RF06. É a regra única da avaliação histórica e da simulação ao vivo.
export function judgeGoalPoint(levels: GoalLevels, point: GoalPoint): GoalOutcome | undefined {
  if (point.equityAtLow.lte(levels.stop)) return GOAL_OUTCOME.STOPPED;
  return point.equity.gte(levels.target) ? GOAL_OUTCOME.REACHED : undefined;
}

export type JudgeGoalStepParams = {
  readonly levels: GoalLevels;
  readonly point: GoalPoint;
  // Candles já fechados da meta, contando este (o primeiro candle da meta vale 1).
  readonly candlesElapsed: number;
  readonly horizonCandles: number;
};

// O veredito do candle e do prazo: alvo e perda máxima têm precedência; o prazo vence no último candle da meta (ou depois
// dele, se a retomada chegar tarde) quando nenhum dos dois veio.
export function judgeGoalStep(params: JudgeGoalStepParams): GoalOutcome | undefined {
  const outcome = judgeGoalPoint(params.levels, params.point);
  if (outcome !== undefined) return outcome;
  return params.candlesElapsed >= params.horizonCandles ? GOAL_OUTCOME.EXPIRED : undefined;
}

// O que o saldo valia no desfecho: o vale do candle na perda máxima, o fechamento no alvo e no prazo.
export function goalFinalValue(outcome: GoalOutcome, point: GoalPoint): EngineDecimalValue {
  return outcome === GOAL_OUTCOME.STOPPED ? point.equityAtLow : point.equity;
}
