// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { MONEY_DECIMAL_PLACES } from '../engine.constant.js';
import {
  DEBIT_ROUNDING_UNITS,
  LOSS_ROUNDING_UNITS,
  SIZING_CONSTRAINT,
  type SizingConstraint,
} from './risk.constant.js';
import type { PositionSizeParams } from './risk.types.js';
import { floorToIncrement } from '../money.js';

const ONE = new EngineDecimal(1);
const ZERO = new EngineDecimal(0);
const MONEY_UNIT = new EngineDecimal(`1e-${MONEY_DECIMAL_PLACES}`);
const DEBIT_SLACK = MONEY_UNIT.times(DEBIT_ROUNDING_UNITS);
const LOSS_SLACK = MONEY_UNIT.times(LOSS_ROUNDING_UNITS);

export type QuantityBound = {
  readonly constraint: SizingConstraint;
  readonly quantity: EngineDecimalValue;
};

export type QuantityBoundParams = {
  readonly params: PositionSizeParams;
  readonly exitPrice: EngineDecimalValue;
};

// Quantidade sempre para baixo no passo; limite negativo (folga maior que o saldo) vira zero.
function roundQuantityDown(value: EngineDecimalValue, step: string): EngineDecimalValue {
  return floorToIncrement(EngineDecimal.max(value, ZERO), step);
}

// Entrada − saída estimada no stop + taxa da entrada + taxa da saída.
function computeRiskPerUnit(input: QuantityBoundParams): EngineDecimalValue {
  const entryPrice = new EngineDecimal(input.params.entryPrice);
  const feeRate = new EngineDecimal(input.params.feeRate);
  const { exitPrice } = input;
  return entryPrice.minus(exitPrice).plus(entryPrice.times(feeRate)).plus(exitPrice.times(feeRate));
}

function listQuantityBounds(input: QuantityBoundParams): readonly QuantityBound[] {
  const { params } = input;
  const step = params.quantityStep;
  const entryPrice = new EngineDecimal(params.entryPrice);
  const riskBudget = new EngineDecimal(params.riskAmount).minus(LOSS_SLACK);
  const byRisk = roundQuantityDown(riskBudget.dividedBy(computeRiskPerUnit(input)), step);
  const exposureValue = new EngineDecimal(params.equity).times(params.maxExposureRate);
  const byExposure = roundQuantityDown(exposureValue.dividedBy(entryPrice), step);
  const feeFactor = ONE.plus(params.feeRate);
  const affordable = new EngineDecimal(params.cash).minus(DEBIT_SLACK).dividedBy(feeFactor);
  const byCash = roundQuantityDown(affordable.dividedBy(entryPrice), step);
  const volumeShare = new EngineDecimal(params.candleVolume).times(params.maxVolumeShare);
  const byVolume = roundQuantityDown(volumeShare, step);
  return [
    { constraint: SIZING_CONSTRAINT.NONE, quantity: byRisk },
    { constraint: SIZING_CONSTRAINT.EXPOSURE_CAPPED, quantity: byExposure },
    { constraint: SIZING_CONSTRAINT.CASH_CAPPED, quantity: byCash },
    { constraint: SIZING_CONSTRAINT.VOLUME_CAPPED, quantity: byVolume },
  ];
}

// O teto que de fato limita é o menor; no empate vale o primeiro da lista (risco, exposição, caixa, volume).
export function resolveQuantityBound(input: QuantityBoundParams): QuantityBound {
  const [first, ...others] = listQuantityBounds(input);
  let tightest = first ?? { constraint: SIZING_CONSTRAINT.NONE, quantity: ZERO };
  for (const bound of others) {
    if (bound.quantity.lessThan(tightest.quantity)) tightest = bound;
  }
  return tightest;
}
