// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import { parseGoalSpec } from '../goal/goal-spec.schema.js';
import type { GoalSpec } from '../goal/goal.types.js';
import { ceilToIncrement } from '../money.js';
import type { RunParameters } from '../strategy-config.types.js';
import type { PlanProtectiveLevel } from './plan.types.js';

const ONE = new EngineDecimal(1);

export type ComputePlanLevelsParams = {
  readonly entry: EngineDecimalValue;
  readonly parameters: RunParameters;
  readonly goal: GoalSpec;
};

export type PlanLevels = {
  readonly target: PlanProtectiveLevel;
  readonly stop: PlanProtectiveLevel;
};

// O preço de VENDA em que o resultado líquido de uma unidade comprada em `entry` é exatamente o ganho alvo (ou a perda
// máxima), com o que o motor cobra: compra a `entry × (1 + slippage)` (tick para cima) mais a taxa, venda a
// `preço × (1 − slippage)` menos a taxa. Ambos sobem ao tick (contra o usuário: o alvo fica mais difícil e o stop vale mais cedo).
export function computePlanLevels(params: ComputePlanLevelsParams): PlanLevels {
  const goal = parseGoalSpec(params.goal);
  const { feeRate, slippageRate, tickSize } = params.parameters;
  const entryFill = ceilToIncrement(params.entry.times(ONE.plus(slippageRate)), tickSize);
  const unitCost = entryFill.times(ONE.plus(feeRate));
  const sellFactor = ONE.minus(feeRate).times(ONE.minus(slippageRate));
  const sellPriceFor = (outcomeRate: EngineDecimalValue): string =>
    formatEngineDecimal(
      ceilToIncrement(unitCost.times(outcomeRate).dividedBy(sellFactor), tickSize),
    );
  return {
    target: {
      rate: goal.targetRate,
      price: sellPriceFor(ONE.plus(toEngineDecimal(goal.targetRate))),
    },
    stop: {
      rate: goal.maxLossRate,
      price: sellPriceFor(ONE.minus(toEngineDecimal(goal.maxLossRate))),
    },
  };
}
