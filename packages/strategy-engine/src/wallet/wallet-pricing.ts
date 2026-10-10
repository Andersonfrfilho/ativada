// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../engine-decimal.js';
import type { RunParameters } from '../strategy-config.types.js';

const ONE = new EngineDecimal(1);
const ZERO = new EngineDecimal(0);

// Todo arredondamento é contra o usuário (ADR 0002 §e): preço de compra para cima no tick, de venda
// para baixo; quantidade para baixo no passo; débito para cima, crédito para baixo; taxa para cima.
export function tickUp(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(parameters.tickSize),
    direction: ROUNDING_DIRECTION.UP,
  });
}

export function tickDown(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(parameters.tickSize),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function stepDown(value: EngineDecimalValue, parameters: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(parameters.quantityStep),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });
}

export function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });
}

// `ceil8(valor × taxa)`, nas duas pontas, em USDT.
export function tradeFee(
  notional: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  return moneyUp(notional.times(toEngineDecimal(parameters.feeRate)));
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
  return moneyUp(notional).plus(tradeFee(notional, parameters));
}

export function sellCredit(
  notional: EngineDecimalValue,
  parameters: RunParameters,
): EngineDecimalValue {
  return moneyDown(notional).minus(tradeFee(notional, parameters));
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
