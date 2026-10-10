// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
  type RunParameters,
} from '../../../packages/strategy-engine/src/index.js';

// Fórmulas do modelo de preenchimento do ADR 0002 §c, compostas das primitivas reais do pacote.
export function tickUp(value: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(run.tickSize),
    direction: ROUNDING_DIRECTION.UP,
  });
}

export function tickDown(value: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(run.tickSize),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function stepDown(value: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return roundToIncrement({
    value,
    increment: toEngineDecimal(run.quantityStep),
    direction: ROUNDING_DIRECTION.DOWN,
  });
}

export function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });
}

export function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });
}

export function feeOf(notional: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return moneyUp(notional.times(toEngineDecimal(run.feeRate)));
}

export function marketBuyPrice(open: string, run: RunParameters): EngineDecimalValue {
  const slippage = new EngineDecimal(1).plus(toEngineDecimal(run.slippageRate));
  return tickUp(toEngineDecimal(open).times(slippage), run);
}

export function marketSellPrice(price: string, run: RunParameters): EngineDecimalValue {
  const slippage = new EngineDecimal(1).minus(toEngineDecimal(run.slippageRate));
  return tickDown(toEngineDecimal(price).times(slippage), run);
}

// Saída do stop em qualquer candle: o pior entre o stop e a abertura, com slippage, tick para baixo.
export function stopExitPrice(stop: string, open: string, run: RunParameters): EngineDecimalValue {
  const worst = EngineDecimal.min(toEngineDecimal(stop), toEngineDecimal(open));
  return marketSellPrice(formatEngineDecimal(worst), run);
}

// Patrimônio a valor de liquidação: o que sobraria vendendo a mercado no preço dado, com taxa.
export function liquidationValue(params: {
  readonly quantity: EngineDecimalValue;
  readonly price: string;
  readonly run: RunParameters;
}): EngineDecimalValue {
  if (params.quantity.isZero()) return new EngineDecimal(0);
  const notional = params.quantity.times(marketSellPrice(params.price, params.run));
  return sellCredit(notional, params.run);
}

// Compra debita o valor arredondado para cima mais a taxa; venda credita o valor para baixo menos a taxa.
export function buyDebit(notional: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return moneyUp(notional).plus(feeOf(notional, run));
}

export function sellCredit(notional: EngineDecimalValue, run: RunParameters): EngineDecimalValue {
  return moneyDown(notional).minus(feeOf(notional, run));
}

// Perda realizada se a posição sair no stop sem gap: débito da entrada − crédito da saída estimada.
export function lossAtStop(params: {
  readonly quantity: EngineDecimalValue;
  readonly entryPrice: EngineDecimalValue;
  readonly stopExit: EngineDecimalValue;
  readonly run: RunParameters;
}): EngineDecimalValue {
  const debit = buyDebit(params.quantity.times(params.entryPrice), params.run);
  return debit.minus(sellCredit(params.quantity.times(params.stopExit), params.run));
}

export function sameDecimal(left: string, right: EngineDecimalValue): boolean {
  return toEngineDecimal(left).equals(right);
}

export { formatEngineDecimal, toEngineDecimal };
