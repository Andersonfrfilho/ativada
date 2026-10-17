// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '@ativada/strategy-engine';

import { TEAM_ACTION, type TeamReport } from './team-report.schema.js';

export const LEVELS_VERDICT = {
  VALID: 'valid',
  INVALID: 'invalid_levels',
} as const;
export type LevelsVerdict = (typeof LEVELS_VERDICT)[keyof typeof LEVELS_VERDICT];

export type CheckTeamLevelsParams = {
  readonly decision: TeamReport['decision'];
  // Fechamento da última vela (texto decimal): a entrada precisa estar perto dele.
  readonly lastClose: string;
  readonly entryTolerancePercent: string;
  readonly minStopPercent: string;
};

const HUNDRED = new EngineDecimal(100);

function isWithinPercent(params: {
  readonly distance: EngineDecimalValue;
  readonly base: EngineDecimalValue;
  readonly percent: string;
}): boolean {
  return params.distance.times(HUNDRED).lessThanOrEqualTo(params.base.times(params.percent));
}

function checkBuyLevels(params: CheckTeamLevelsParams): boolean {
  const { decision } = params;
  if (
    decision.entryPrice === null ||
    decision.targetPrice === null ||
    decision.stopPrice === null
  ) {
    return false;
  }
  const entry = new EngineDecimal(decision.entryPrice);
  const target = new EngineDecimal(decision.targetPrice);
  const stop = new EngineDecimal(decision.stopPrice);
  const close = new EngineDecimal(params.lastClose);
  if (!(stop.lessThan(entry) && entry.lessThan(target))) return false;
  const isNearClose = isWithinPercent({
    distance: entry.minus(close).abs(),
    base: close,
    percent: params.entryTolerancePercent,
  });
  const stopDistance = entry.minus(stop).times(HUNDRED);
  const isStopFarEnough = stopDistance.greaterThanOrEqualTo(entry.times(params.minStopPercent));
  return isNearClose && isStopFarEnough;
}

// RF07: `buy` exige os três preços com `proteção < entrada < alvo`, a entrada perto do fechamento e a proteção a uma
// distância mínima da entrada (no limite exato ainda vale); `sell` e `hold` exigem os três nulos.
export function checkTeamLevels(params: CheckTeamLevelsParams): LevelsVerdict {
  const { decision } = params;
  if (decision.action === TEAM_ACTION.BUY) {
    return checkBuyLevels(params) ? LEVELS_VERDICT.VALID : LEVELS_VERDICT.INVALID;
  }
  const hasPrice =
    decision.entryPrice !== null || decision.targetPrice !== null || decision.stopPrice !== null;
  return hasPrice ? LEVELS_VERDICT.INVALID : LEVELS_VERDICT.VALID;
}
