// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../engine-decision.types.js';
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import {
  buyDebit,
  liquidationValue,
  marketBuyPrice,
  moneyDown,
  stepDown,
} from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

const ONE = new EngineDecimal(1);

// "Comprar e segurar" compra com todo o saldo na abertura seguinte ao primeiro sinal, uma vez.
export function buyBenchmark(draft: WalletDraft, context: WalletContext): void {
  const { state } = draft;
  if (state.benchmark !== null || state.firstSignalCandleOpenTime === null) return;
  const { parameters, candle } = context;
  const initial = toEngineDecimal(parameters.initialBalance);
  const price = marketBuyPrice(candle.open, parameters);
  const budget = moneyDown(initial.dividedBy(ONE.plus(toEngineDecimal(parameters.feeRate))));
  const quantity = stepDown(budget.dividedBy(price), parameters);
  const cash = initial.minus(buyDebit(quantity.times(price), parameters));
  draft.state = {
    ...state,
    benchmark: { quantity: formatEngineDecimal(quantity), cash: formatEngineDecimal(cash) },
  };
}

function benchmarkValue(draft: WalletDraft, context: WalletContext): string {
  const { benchmark } = draft.state;
  const { parameters, candle } = context;
  if (benchmark === null) return parameters.initialBalance;
  const held = liquidationValue(
    { quantity: toEngineDecimal(benchmark.quantity), price: candle.close },
    parameters,
  );
  return formatEngineDecimal(toEngineDecimal(benchmark.cash).plus(held));
}

// Patrimônio a valor de liquidação no fechamento e na mínima (lado pior: perda máxima e piso).
export function buildEquityPoint(draft: WalletDraft, context: WalletContext): EquityPointDecision {
  const { state } = draft;
  const { parameters, candle } = context;
  const quantity = toEngineDecimal(state.position?.quantity ?? '0');
  const cash = toEngineDecimal(state.cash);
  const valueAt = (price: string): string =>
    formatEngineDecimal(cash.plus(liquidationValue({ quantity, price }, parameters)));
  return {
    candleOpenTime: candle.openTime,
    equity: valueAt(candle.close),
    equityAtLow: valueAt(candle.low),
    benchmark: benchmarkValue(draft, context),
  };
}
