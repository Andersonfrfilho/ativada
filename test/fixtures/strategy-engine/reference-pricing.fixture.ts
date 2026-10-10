// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
  type ExecutionConfig,
} from '../../../packages/strategy-engine/src/index.js';

// Fórmulas do modelo de preenchimento do ADR 0002 §c, compostas das primitivas reais do pacote.
export function tickUp(value: EngineDecimalValue, execution: ExecutionConfig): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(execution.tickSize),
    direction: ROUNDING_DIRECTION.UP,
  });
}

export function tickDown(
  value: EngineDecimalValue,
  execution: ExecutionConfig,
): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(execution.tickSize),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function stepDown(
  value: EngineDecimalValue,
  execution: ExecutionConfig,
): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(execution.quantityStep),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });
}

export function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });
}

export function feeOf(
  notional: EngineDecimalValue,
  execution: ExecutionConfig,
): EngineDecimalValue {
  return moneyUp(notional.times(toEngineDecimal(execution.feeRate)));
}

export function marketBuyPrice(open: string, execution: ExecutionConfig): EngineDecimalValue {
  const slippage = new EngineDecimal(1).plus(toEngineDecimal(execution.slippageRate));
  return tickUp(toEngineDecimal(open).times(slippage), execution);
}

export function marketSellPrice(price: string, execution: ExecutionConfig): EngineDecimalValue {
  const slippage = new EngineDecimal(1).minus(toEngineDecimal(execution.slippageRate));
  return tickDown(toEngineDecimal(price).times(slippage), execution);
}

// Patrimônio a valor de liquidação: o que sobraria vendendo a mercado no fechamento, com taxa.
export function liquidationValue(params: {
  readonly quantity: EngineDecimalValue;
  readonly close: string;
  readonly execution: ExecutionConfig;
}): EngineDecimalValue {
  if (params.quantity.isZero()) return new EngineDecimal(0);
  const notional = params.quantity.times(marketSellPrice(params.close, params.execution));
  return sellCredit(notional, params.execution);
}

// Compra debita o valor arredondado para cima mais a taxa; venda credita o valor para baixo menos a taxa.
export function buyDebit(
  notional: EngineDecimalValue,
  execution: ExecutionConfig,
): EngineDecimalValue {
  return moneyUp(notional).plus(feeOf(notional, execution));
}

export function sellCredit(
  notional: EngineDecimalValue,
  execution: ExecutionConfig,
): EngineDecimalValue {
  return moneyDown(notional).minus(feeOf(notional, execution));
}

export function sameDecimal(left: string, right: EngineDecimalValue): boolean {
  return toEngineDecimal(left).equals(right);
}

export { formatEngineDecimal, toEngineDecimal };
