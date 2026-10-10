// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineDecimal } from '../engine-decimal.js';
import { GOAL_VERDICT, GOAL_VERDICT_RULES, type GoalVerdict } from './goal.constant.js';

export type ResolveGoalVerdictParams = {
  readonly windowCount: number;
  readonly reachedCount: number;
  readonly stoppedCount: number;
};

// `contagem / janelas >= taxa` sem dividir: contagem × 1 >= taxa × janelas, exato em decimal.
function isRateAtLeast(params: {
  readonly count: number;
  readonly windowCount: number;
  readonly rate: string;
}): boolean {
  return toEngineDecimal(params.rate).times(params.windowCount).lte(params.count);
}

function isRateAtMost(params: {
  readonly count: number;
  readonly windowCount: number;
  readonly rate: string;
}): boolean {
  return toEngineDecimal(params.rate).times(params.windowCount).gte(params.count);
}

// A régua de COMPRAR / SEGURAR / EVITAR (limiares em `GOAL_VERDICT_RULES`, ADR 0002 §"Metas (T4b.1)"): sobre as
// contagens exatas, nunca sobre a taxa arredondada; sem janelas suficientes não há base para recomendar nada.
export function resolveGoalVerdict(params: ResolveGoalVerdictParams): GoalVerdict {
  const { windowCount, reachedCount, stoppedCount } = params;
  const rules = GOAL_VERDICT_RULES;
  if (windowCount < rules.minimumWindows) return GOAL_VERDICT.HOLD;
  const reach = { count: reachedCount, windowCount };
  const stop = { count: stoppedCount, windowCount };
  const isAvoid =
    isRateAtLeast({ ...stop, rate: rules.avoidMinimumStopRate }) ||
    isRateAtMost({ ...reach, rate: rules.avoidMaximumReachRate });
  if (isAvoid) return GOAL_VERDICT.AVOID;
  const isBuy =
    isRateAtLeast({ ...reach, rate: rules.buyMinimumReachRate }) &&
    isRateAtMost({ ...stop, rate: rules.buyMaximumStopRate });
  return isBuy ? GOAL_VERDICT.BUY : GOAL_VERDICT.HOLD;
}
