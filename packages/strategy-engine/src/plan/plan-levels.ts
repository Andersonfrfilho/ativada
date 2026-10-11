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

type SellContext = {
  readonly unitCost: EngineDecimalValue;
  readonly parameters: RunParameters;
};

// O preço de VENDA (tick para cima) em que vender uma unidade que custou `unitCost` rende `outcomeRate` do custo, com a taxa
// e o slippage de saída que o motor cobra: venda a `preço × (1 − slippage)` menos a taxa.
function sellPriceFor(context: SellContext, outcomeRate: EngineDecimalValue): string {
  const { feeRate, slippageRate, tickSize } = context.parameters;
  const sellFactor = ONE.minus(feeRate).times(ONE.minus(slippageRate));
  return formatEngineDecimal(
    ceilToIncrement(context.unitCost.times(outcomeRate).dividedBy(sellFactor), tickSize),
  );
}

function protectiveLevels(context: SellContext, goal: GoalSpec): PlanLevels {
  return {
    target: {
      rate: goal.targetRate,
      price: sellPriceFor(context, ONE.plus(toEngineDecimal(goal.targetRate))),
    },
    stop: {
      rate: goal.maxLossRate,
      price: sellPriceFor(context, ONE.minus(toEngineDecimal(goal.maxLossRate))),
    },
  };
}

// Alvo e stop de uma compra FUTURA em `entry`: o custo por unidade inclui o que o motor cobra na entrada (compra a
// `entry × (1 + slippage)` no tick, mais a taxa). Ambos sobem ao tick (contra o usuário: o alvo fica mais difícil e o stop
// vale mais cedo). Se a perda máxima for menor que o custo de entrar, o stop sai acima da entrada e o fato não se esconde.
export function computePlanLevels(params: ComputePlanLevelsParams): PlanLevels {
  const goal = parseGoalSpec(params.goal);
  const { feeRate, slippageRate, tickSize } = params.parameters;
  const entryFill = ceilToIncrement(params.entry.times(ONE.plus(slippageRate)), tickSize);
  const unitCost = entryFill.times(ONE.plus(feeRate));
  return protectiveLevels({ unitCost, parameters: params.parameters }, goal);
}

export type ComputeHoldingLevelsParams = {
  // O preço médio que o usuário informou: já é o custo dele, sem somar taxa nem slippage de entrada.
  readonly averagePrice: EngineDecimalValue;
  readonly parameters: RunParameters;
  readonly goal: GoalSpec;
};

// Alvo e stop de uma posição JÁ comprada (RF15): partem do preço médio como custo e só cobram a saída.
export function computeHoldingLevels(params: ComputeHoldingLevelsParams): PlanLevels {
  const goal = parseGoalSpec(params.goal);
  return protectiveLevels({ unitCost: params.averagePrice, parameters: params.parameters }, goal);
}
