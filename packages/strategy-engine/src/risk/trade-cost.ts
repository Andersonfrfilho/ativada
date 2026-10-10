// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  type EngineDecimalValue,
} from '../engine-decimal.js';
import { floorToIncrement } from './rounding.js';

const ONE = new EngineDecimal(1);

function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });
}

function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });
}

function feeOf(notional: EngineDecimalValue, feeRate: EngineDecimalValue): EngineDecimalValue {
  return moneyUp(notional.times(feeRate));
}

// Compra debita o valor para cima mais a taxa para cima: sempre contra o usuário.
export function buyDebit(
  notional: EngineDecimalValue,
  feeRate: EngineDecimalValue,
): EngineDecimalValue {
  return moneyUp(notional).plus(feeOf(notional, feeRate));
}

export function sellCredit(
  notional: EngineDecimalValue,
  feeRate: EngineDecimalValue,
): EngineDecimalValue {
  return moneyDown(notional).minus(feeOf(notional, feeRate));
}

export type StopExitParams = {
  readonly stopPrice: string;
  readonly slippageRate: string;
  readonly tickSize: string;
};

// Saída estimada no stop sem gap: slippage contra o usuário e tick para baixo.
export function estimateStopExit(params: StopExitParams): EngineDecimalValue {
  const slipped = new EngineDecimal(params.stopPrice).times(ONE.minus(params.slippageRate));
  return floorToIncrement(slipped, params.tickSize);
}

export type StopLossParams = {
  readonly quantity: EngineDecimalValue;
  readonly entryPrice: EngineDecimalValue;
  readonly exitPrice: EngineDecimalValue;
  readonly feeRate: EngineDecimalValue;
};

// Perda realizada se a posição sair no stop sem gap: débito da entrada − crédito da saída.
export function lossAtStop(params: StopLossParams): EngineDecimalValue {
  const { quantity, feeRate } = params;
  const debit = buyDebit(quantity.times(params.entryPrice), feeRate);
  return debit.minus(sellCredit(quantity.times(params.exitPrice), feeRate));
}
