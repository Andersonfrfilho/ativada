// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../engine-decision.types.js';
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../engine-decimal.js';
import { moneyDown } from '../money.js';
import { EXIT_REASON, ORDER_SIDE } from '../engine-vocabulary.constant.js';
import type { RunParameters } from '../strategy-config.types.js';
import {
  buyDebit,
  liquidationValue,
  marketBuyPrice,
  sellCredit,
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

type Holding = { readonly quantity: EngineDecimalValue; readonly cash: EngineDecimalValue };

// Posição que saiu pelo alvo neste candle: existiu durante ele e a ordem dos extremos é desconhecida, então
// o lado pior vale a mínima. Stop (o patrimônio mínimo é o da saída), venda pendente e lacuna saem antes dela.
function targetExitHolding(draft: WalletDraft, parameters: RunParameters): Holding | null {
  const closed = draft.closedPositions.find(
    (position) => position.exitReason === EXIT_REASON.TARGET,
  );
  const sale = draft.fills.find(
    (fill) => fill.side === ORDER_SIDE.SELL && fill.positionKey === closed?.positionKey,
  );
  if (closed === undefined || sale === undefined) return null;
  const credit = sellCredit(toEngineDecimal(sale.notional), parameters);
  return {
    quantity: toEngineDecimal(closed.quantity),
    cash: toEngineDecimal(draft.state.cash).minus(credit),
  };
}

function holdingDuringCandle(draft: WalletDraft, parameters: RunParameters): Holding | null {
  const { position, cash } = draft.state;
  if (position === null) return targetExitHolding(draft, parameters);
  return { quantity: toEngineDecimal(position.quantity), cash: toEngineDecimal(cash) };
}

// Patrimônio a valor de liquidação no fechamento (`equity`) e no vale do candle (`equityAtLow`): o menor
// entre a posição que existiu durante o candle valorada na mínima e o valor ao fim do passo (§e).
export function buildEquityPoint(draft: WalletDraft, context: WalletContext): EquityPointDecision {
  const { state } = draft;
  const { parameters, candle } = context;
  const quantity = toEngineDecimal(state.position?.quantity ?? '0');
  const cash = toEngineDecimal(state.cash);
  const equity = cash.plus(liquidationValue({ quantity, price: candle.close }, parameters));
  const held = holdingDuringCandle(draft, parameters);
  const valleyValue =
    held === null
      ? equity
      : held.cash.plus(
          liquidationValue({ quantity: held.quantity, price: candle.low }, parameters),
        );
  return {
    candleOpenTime: candle.openTime,
    equity: formatEngineDecimal(equity),
    equityAtLow: formatEngineDecimal(EngineDecimal.min(equity, valleyValue)),
    benchmark: benchmarkValue(draft, context),
  };
}
