// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { computeBuyDebit, computeSellCredit, floorToIncrement } from '../money.js';

const ONE = new EngineDecimal(1);

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
  const debit = computeBuyDebit(quantity.times(params.entryPrice), feeRate);
  return debit.minus(computeSellCredit(quantity.times(params.exitPrice), feeRate));
}
