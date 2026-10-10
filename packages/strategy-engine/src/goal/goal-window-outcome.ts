// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_OUTCOME } from './goal.constant.js';
import { goalFinalValue, judgeGoalPoint } from './goal-progress.js';
import type { GoalLevels, GoalPoint, GoalWindowResult } from './goal.types.js';

export type ClassifyGoalWindowParams = {
  readonly levels: GoalLevels;
  readonly horizonCandles: number;
  readonly pointAt: (offset: number) => GoalPoint;
};

// Varre a janela candle a candle com o veredito de `judgeGoalPoint` (perda máxima antes do alvo no mesmo candle). O valor
// final é o que o saldo valia no desfecho: o vale na perda máxima, o fechamento no alvo e no prazo.
export function classifyGoalWindow(params: ClassifyGoalWindowParams): GoalWindowResult {
  const { levels, horizonCandles } = params;
  for (let offset = 0; offset < horizonCandles; offset += 1) {
    const point = params.pointAt(offset);
    const outcome = judgeGoalPoint(levels, point);
    if (outcome !== undefined) {
      return { outcome, candlesElapsed: offset + 1, finalValue: goalFinalValue(outcome, point) };
    }
  }
  return {
    outcome: GOAL_OUTCOME.EXPIRED,
    candlesElapsed: horizonCandles,
    finalValue: params.pointAt(horizonCandles - 1).equity,
  };
}
