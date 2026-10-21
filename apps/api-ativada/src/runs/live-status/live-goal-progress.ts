// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeGoalLevels,
  EngineDecimal,
  formatEngineDecimal,
  MILLISECONDS_PER_DAY,
  toEngineDecimal,
  type GoalSpec,
} from '@ativada/strategy-engine';

import { roundMoneyDown, roundMoneyUp } from '../money-rounding.js';
import { LIVE_RATE_DECIMAL_PLACES } from './live-status.constant.js';

export type LiveGoalProgressParams = {
  readonly goal: GoalSpec;
  readonly initial: string;
  readonly current: string;
  // A abertura da vela em curso na criação: a base do prazo, a mesma que o worker usa (ADR 0002, spec 008, L8).
  readonly periodStart: number;
  readonly now: number;
};

export type LiveGoalProgress = {
  readonly targetRate: string;
  readonly targetAmount: string;
  readonly remainingAmount: string;
  readonly remainingRate: string;
  readonly deadlineAt: number;
  readonly remainingMilliseconds: number;
  readonly maxLossRate: string;
  readonly floorAmount: string;
  readonly lossRoomAmount: string;
};

const ZERO = new EngineDecimal(0);

// Quanto falta para o alvo (para CIMA) e quanto ainda cabe de queda (para BAIXO), nunca abaixo de zero (ADR 0002, L8).
export function computeLiveGoalProgress(params: LiveGoalProgressParams): LiveGoalProgress {
  const { goal } = params;
  const initial = toEngineDecimal(params.initial);
  const current = toEngineDecimal(params.current);
  const levels = computeGoalLevels({ initial, goal });
  const remainingAmount = EngineDecimal.max(ZERO, roundMoneyUp(levels.target.minus(current)));
  const lossRoomAmount = EngineDecimal.max(ZERO, roundMoneyDown(current.minus(levels.stop)));
  const deadlineAt = params.periodStart + goal.horizonDays * MILLISECONDS_PER_DAY;
  return {
    targetRate: goal.targetRate,
    targetAmount: formatEngineDecimal(levels.target),
    remainingAmount: formatEngineDecimal(remainingAmount),
    remainingRate: formatEngineDecimal(
      remainingAmount
        .dividedBy(initial)
        .toDecimalPlaces(LIVE_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
    ),
    deadlineAt,
    remainingMilliseconds: Math.max(0, deadlineAt - params.now),
    maxLossRate: goal.maxLossRate,
    floorAmount: formatEngineDecimal(levels.stop),
    lossRoomAmount: formatEngineDecimal(lossRoomAmount),
  };
}
