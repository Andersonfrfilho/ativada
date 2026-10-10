// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_OUTCOME } from './goal.constant.js';
import type { GoalLevels, GoalPoint, GoalWindowResult } from './goal.types.js';

export type ClassifyGoalWindowParams = {
  readonly levels: GoalLevels;
  readonly horizonCandles: number;
  readonly pointAt: (offset: number) => GoalPoint;
};

// Varre a janela candle a candle: no mesmo candle, a perda máxima (medida no vale) vale antes do alvo (medido no
// fechamento) — o lado pior, como o stop e o alvo do RF06. O valor final é o que o saldo valia no desfecho:
// o vale na perda máxima, o fechamento no alvo e no prazo.
export function classifyGoalWindow(params: ClassifyGoalWindowParams): GoalWindowResult {
  const { levels, horizonCandles } = params;
  for (let offset = 0; offset < horizonCandles; offset += 1) {
    const point = params.pointAt(offset);
    if (point.equityAtLow.lte(levels.stop)) {
      return {
        outcome: GOAL_OUTCOME.STOPPED,
        candlesElapsed: offset + 1,
        finalValue: point.equityAtLow,
      };
    }
    if (point.equity.gte(levels.target)) {
      return {
        outcome: GOAL_OUTCOME.REACHED,
        candlesElapsed: offset + 1,
        finalValue: point.equity,
      };
    }
  }
  return {
    outcome: GOAL_OUTCOME.EXPIRED,
    candlesElapsed: horizonCandles,
    finalValue: params.pointAt(horizonCandles - 1).equity,
  };
}
