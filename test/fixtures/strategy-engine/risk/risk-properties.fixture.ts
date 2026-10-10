// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type EngineDecimalValue,
  type ComputeProtectivePricesParams,
  type PositionSizeParams,
  type PositionSizeResult,
  type ProtectivePricesResult,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  buyDebit,
  lossAtStop,
  marketSellPrice,
  toEngineDecimal,
} from '../reference-pricing.fixture.js';
import { runOf } from './reference-risk.fixture.js';

// Propriedades que valem para QUALQUER resultado, sem consultar o oráculo.
const ONE = new EngineDecimal(1);
const REFUSED_CONSTRAINTS: readonly string[] = ['zero_risk', 'invalid_stop', 'below_min_notional'];

function isMultipleOf(value: EngineDecimalValue, increment: string): boolean {
  return value.dividedBy(increment).isInteger();
}

export function findProtectiveViolation(
  params: ComputeProtectivePricesParams,
  result: ProtectivePricesResult,
): string | undefined {
  if (result.kind === 'refused') return undefined;
  const entry = toEngineDecimal(params.entryPrice);
  const stop = toEngineDecimal(result.stopPrice);
  const target = toEngineDecimal(result.targetPrice);
  const atr = toEngineDecimal(params.atr);
  const rawStop = entry.minus(atr.times(params.stopAtrMultiple));
  const rawTarget = entry.plus(atr.times(params.targetAtrMultiple));
  if (stop.lte(0)) return 'stop não positivo';
  if (!isMultipleOf(stop, params.tickSize)) return 'stop fora do tick';
  if (!isMultipleOf(target, params.tickSize)) return 'alvo fora do tick';
  if (stop.greaterThan(rawStop)) return 'stop arredondado para cima';
  if (target.lessThan(rawTarget)) return 'alvo arredondado para baixo';
  if (stop.gte(entry.times(ONE.minus(params.slippageRate))))
    return 'stop acima do piso de slippage';
  if (!target.greaterThan(entry)) return 'alvo não acima da entrada';
  return undefined;
}

type SizedContext = {
  readonly params: PositionSizeParams;
  readonly result: PositionSizeResult;
};

function findLimitViolation({ params, result }: SizedContext): string | undefined {
  const quantity = toEngineDecimal(result.quantity);
  const notional = quantity.times(params.entryPrice);
  const exposure = toEngineDecimal(params.equity).times(params.maxExposureRate);
  const share = toEngineDecimal(params.candleVolume).times(params.maxVolumeShare);
  if (!isMultipleOf(quantity, params.quantityStep)) return 'quantidade fora do passo';
  if (notional.lessThan(params.minNotional)) return 'notional abaixo do mínimo';
  if (notional.greaterThan(exposure)) return 'exposição acima do teto';
  if (quantity.greaterThan(share)) return 'quantidade passa da participação no volume de t';
  if (toEngineDecimal(result.notional).toFixed() !== notional.toFixed()) {
    return 'notional diferente de preço × quantidade';
  }
  return undefined;
}

function findMoneyViolation({ params, result }: SizedContext): string | undefined {
  const run = runOf(params);
  const quantity = toEngineDecimal(result.quantity);
  const entry = toEngineDecimal(params.entryPrice);
  const stopExit = marketSellPrice(params.stopPrice, run);
  const loss = lossAtStop({ quantity, entryPrice: entry, stopExit, run });
  if (loss.greaterThan(params.riskAmount)) return `perda no stop ${loss.toFixed()} passa do risco`;
  if (loss.toFixed() !== toEngineDecimal(result.estimatedStopLoss).toFixed()) {
    return 'perda estimada incoerente';
  }
  if (buyDebit(quantity.times(entry), run).greaterThan(params.cash)) return 'débito passa do caixa';
  return undefined;
}

export function findSizeViolation(
  params: PositionSizeParams,
  result: PositionSizeResult,
): string | undefined {
  if (!toEngineDecimal(result.quantity).greaterThan(0)) {
    const isConsistent = result.notional === '0' && result.estimatedStopLoss === '0';
    return isConsistent ? undefined : 'recusa com valores não nulos';
  }
  if (REFUSED_CONSTRAINTS.includes(result.constraint)) {
    return 'tamanho positivo com restrição de recusa';
  }
  const context = { params, result };
  return findMoneyViolation(context) ?? findLimitViolation(context);
}
