// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
} from './engine-decimal.js';

// A única aritmética de dinheiro do motor (ADR 0002 §e): a carteira simulada e o dimensionamento de risco a
// importam daqui. Todo arredondamento é contra o usuário: débito para cima, crédito para baixo, taxa para
// cima, 8 casas; preço de compra para cima e de venda para baixo no tick; quantidade para baixo no passo.
export function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });
}

export function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });
}

export function floorToIncrement(value: EngineDecimalValue, increment: string): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(increment),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function ceilToIncrement(value: EngineDecimalValue, increment: string): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(increment),
    direction: ROUNDING_DIRECTION.UP,
  });
}

// `ceil8(valor × taxa)`, nas duas pontas, em USDT.
export function computeTradeFee(
  notional: EngineDecimalValue,
  feeRate: EngineDecimalValue,
): EngineDecimalValue {
  return moneyUp(notional.times(feeRate));
}

// Compra debita o valor para cima mais a taxa para cima: sempre contra o usuário.
export function computeBuyDebit(
  notional: EngineDecimalValue,
  feeRate: EngineDecimalValue,
): EngineDecimalValue {
  return moneyUp(notional).plus(computeTradeFee(notional, feeRate));
}

// Venda credita o valor para baixo menos a taxa para cima.
export function computeSellCredit(
  notional: EngineDecimalValue,
  feeRate: EngineDecimalValue,
): EngineDecimalValue {
  return moneyDown(notional).minus(computeTradeFee(notional, feeRate));
}
