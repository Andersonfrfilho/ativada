// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, toEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import {
  ceilToIncrement,
  computeBuyDebit,
  computeSellCredit,
  computeTradeFee,
  floorToIncrement,
} from '../money.js';
import type { RunParameters } from '../strategy-config.types.js';

const ONE = new EngineDecimal(1);
const ZERO = new EngineDecimal(0);

// Preço ao tick e quantidade ao passo dos parâmetros da execução; as contas de dinheiro vivem em `money.ts`.
export function tickUp(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return ceilToIncrement(value, parameters.tickSize);
}

export function tickDown(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return floorToIncrement(value, parameters.tickSize);
}

export function stepDown(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return floorToIncrement(value, parameters.quantityStep);
}

export function tradeFee(
  notional: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  return computeTradeFee(notional, toEngineDecimal(parameters.feeRate));
}

// Compra a mercado: abertura + slippage, tick para cima.
export function marketBuyPrice(open: string, parameters: RunParameters): EngineDecimalValue {
  const slipped = toEngineDecimal(open).times(ONE.plus(toEngineDecimal(parameters.slippageRate)));
  return tickUp(slipped, parameters);
}

// Venda a mercado: preço − slippage, tick para baixo.
export function marketSellPrice(
  price: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  const slipped = price.times(ONE.minus(toEngineDecimal(parameters.slippageRate)));
  return tickDown(slipped, parameters);
}

export type StopExitParams = {
  readonly stop: string;
  readonly open: string;
};

// Saída do stop em qualquer candle: o pior entre o stop e a abertura, com slippage, tick para baixo.
export function stopExitPrice(
  params: StopExitParams,
  parameters: RunParameters,
): EngineDecimalValue {
  const worst = EngineDecimal.min(toEngineDecimal(params.stop), toEngineDecimal(params.open));
  return marketSellPrice(worst, parameters);
}

export function buyDebit(
  notional: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  return computeBuyDebit(notional, toEngineDecimal(parameters.feeRate));
}

export function sellCredit(
  notional: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  return computeSellCredit(notional, toEngineDecimal(parameters.feeRate));
}

export type LiquidationParams = {
  readonly quantity: EngineDecimalValue;
  readonly price: string;
};

// O que sobraria vendendo a mercado ao preço dado, com slippage e taxa: patrimônio a valor de liquidação.
export function liquidationValue(
  params: LiquidationParams,
  parameters: RunParameters,
): EngineDecimalValue {
  if (params.quantity.isZero()) return ZERO;
  const exitPrice = marketSellPrice(toEngineDecimal(params.price), parameters);
  return sellCredit(params.quantity.times(exitPrice), parameters);
}
