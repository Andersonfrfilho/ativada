// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ALERT_SIDE, type AlertInput } from '@cryptoada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineCandle,
} from '@cryptoada/strategy-engine';

import type { GoalAlertPayload } from './alert-payload.schema.js';
import type { GoalDecision, GoalTracking } from './goal-step.js';

const RESULT_DECIMAL_PLACES = 8;

export type BuildGoalAlertParams = {
  readonly tracking: GoalTracking;
  readonly candle: EngineCandle;
  readonly decision: GoalDecision;
  readonly run: { readonly symbol: string; readonly timeframe: string };
};

// O alerta do desfecho (alvo, perda máxima ou prazo): só mercado e a meta, nunca pessoa, chat nem segredo. O resultado é
// uma fração do saldo inicial arredondada para BAIXO, como as demais taxas contra o usuário.
export function buildGoalAlert(params: BuildGoalAlertParams): AlertInput {
  const { tracking, candle, decision } = params;
  const initial = toEngineDecimal(tracking.initialBalance);
  const resultRate = toEngineDecimal(decision.finalValue)
    .minus(initial)
    .dividedBy(initial)
    .toDecimalPlaces(RESULT_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR);
  const payload: GoalAlertPayload = {
    symbol: params.run.symbol,
    timeframe: params.run.timeframe,
    outcome: decision.runOutcome,
    targetRate: tracking.spec.targetRate,
    maxLossRate: tracking.spec.maxLossRate,
    horizonDays: tracking.spec.horizonDays,
    initialBalance: tracking.initialBalance,
    finalValue: decision.finalValue,
    resultRate: formatEngineDecimal(resultRate),
  };
  return { candleTime: candle.openTime, side: ALERT_SIDE.GOAL, payload };
}
