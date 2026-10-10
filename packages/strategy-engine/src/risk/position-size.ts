// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal } from '../engine-decimal.js';
import { resolveQuantityBound } from './quantity-bound.js';
import { SIZING_CONSTRAINT, type SizingConstraint } from './risk.constant.js';
import type { PositionSizeParams, PositionSizeResult } from './risk.types.js';
import { estimateStopExit, lossAtStop } from './trade-cost.js';

const ONE = new EngineDecimal(1);
const ZERO = new EngineDecimal(0);

function refuse(constraint: SizingConstraint): PositionSizeResult {
  return { quantity: '0', notional: '0', estimatedStopLoss: '0', constraint };
}

// Único dimensionamento do produto (RF05; a spec 002 o reutiliza no envio da ordem). Pura, texto decimal.
// quantidade = piso_passo((risco − folga) ÷ (P − X + P·taxa + X·taxa)), com X a saída estimada no stop,
// limitada por exposição, caixa e participação no volume do candle de decisão. Perda no stop sem gap
// (taxas das duas pontas e slippage de saída) < risco; débito < caixa; arredondamento contra o usuário.
export function computePositionSize(params: PositionSizeParams): PositionSizeResult {
  const riskAmount = new EngineDecimal(params.riskAmount);
  if (riskAmount.lte(ZERO)) return refuse(SIZING_CONSTRAINT.ZERO_RISK);
  const entryPrice = new EngineDecimal(params.entryPrice);
  const stopPrice = new EngineDecimal(params.stopPrice);
  const highestStop = entryPrice.times(ONE.minus(params.slippageRate));
  if (stopPrice.lte(ZERO) || stopPrice.gte(highestStop)) {
    return refuse(SIZING_CONSTRAINT.INVALID_STOP);
  }
  const exitPrice = estimateStopExit(params);
  const { constraint, quantity } = resolveQuantityBound({ params, exitPrice });
  const notional = quantity.times(entryPrice);
  const isBelowMinimum = notional.lessThan(params.minNotional);
  if (quantity.lte(ZERO) || isBelowMinimum) return refuse(SIZING_CONSTRAINT.BELOW_MIN_NOTIONAL);
  const feeRate = new EngineDecimal(params.feeRate);
  const loss = lossAtStop({ quantity, entryPrice, exitPrice, feeRate });
  return {
    quantity: formatEngineDecimal(quantity),
    notional: formatEngineDecimal(notional),
    estimatedStopLoss: formatEngineDecimal(loss),
    constraint,
  };
}
