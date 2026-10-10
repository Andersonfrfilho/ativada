// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, toEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { moneyUp } from '../money.js';
import type { GoalLevels, GoalSpec } from './goal.types.js';

const ONE = new EngineDecimal(1);

// Alvo e perda máxima como níveis de patrimônio, ambos arredondados para CIMA a 8 casas (contra o usuário): o alvo
// fica mais difícil e o stop dispara mais cedo.
export function computeGoalLevels(params: {
  readonly initial: EngineDecimalValue;
  readonly goal: GoalSpec;
}): GoalLevels {
  const { initial, goal } = params;
  return {
    target: moneyUp(initial.times(ONE.plus(toEngineDecimal(goal.targetRate)))),
    stop: moneyUp(initial.times(ONE.minus(toEngineDecimal(goal.maxLossRate)))),
  };
}
