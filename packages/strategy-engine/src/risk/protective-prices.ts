// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal } from '../engine-decimal.js';
import { PROTECTIVE_REFUSAL, type ProtectiveRefusal } from './risk.constant.js';
import type { ComputeProtectivePricesParams, ProtectivePricesResult } from './risk.types.js';
import { ceilToIncrement, floorToIncrement } from '../money.js';

const ONE = new EngineDecimal(1);
const ZERO = new EngineDecimal(0);

function refuse(reason: ProtectiveRefusal): ProtectivePricesResult {
  return { kind: 'refused', reason };
}

// Stop e alvo nascem do preço de PREENCHIMENTO `P` com o ATR de `t` (nunca o fechamento de `t` nem o
// ATR de `t+1`): stop = P − k·ATR para baixo no tick; alvo = P + m·ATR para cima no tick.
export function computeProtectivePrices(
  params: ComputeProtectivePricesParams,
): ProtectivePricesResult {
  const entryPrice = new EngineDecimal(params.entryPrice);
  const atr = new EngineDecimal(params.atr);
  if (atr.lte(ZERO)) return refuse(PROTECTIVE_REFUSAL.ZERO_ATR);
  const stopDistance = atr.times(params.stopAtrMultiple);
  const targetDistance = atr.times(params.targetAtrMultiple);
  const rawStop = entryPrice.minus(stopDistance);
  if (rawStop.lte(ZERO)) return refuse(PROTECTIVE_REFUSAL.INVALID_STOP);
  const stop = floorToIncrement(rawStop, params.tickSize);
  if (stop.isZero()) return refuse(PROTECTIVE_REFUSAL.STOP_BELOW_TICK);
  if (stop.gte(entryPrice.times(ONE.minus(params.slippageRate)))) {
    return refuse(PROTECTIVE_REFUSAL.INVALID_STOP);
  }
  const target = ceilToIncrement(entryPrice.plus(targetDistance), params.tickSize);
  return {
    kind: 'priced',
    stopPrice: formatEngineDecimal(stop),
    targetPrice: formatEngineDecimal(target),
    stopDistance: formatEngineDecimal(stopDistance),
    targetDistance: formatEngineDecimal(targetDistance),
  };
}
