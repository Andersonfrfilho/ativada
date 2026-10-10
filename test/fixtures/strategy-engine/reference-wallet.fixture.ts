// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertWalletStepInput,
  ENGINE_INPUT_ERROR_CODE,
  EngineDecimal,
  EngineInputError,
  type EquityPointDecision,
  type WalletStepInput,
  type WalletStepResult,
} from '../../../packages/strategy-engine/src/index.js';
import { guardInput, type ReferenceEngineDefect } from './reference-engine-defect.fixture.js';
import { evaluateProtectiveExits, executePendingOrder } from './reference-fills.fixture.js';
import type { WalletContext, WalletDraft } from './reference-orders.fixture.js';
import { applyClose } from './reference-policy.fixture.js';
import {
  feeOf,
  formatEngineDecimal,
  liquidationValue,
  marketBuyPrice,
  moneyDown,
  moneyUp,
  stepDown,
  toEngineDecimal,
} from './reference-pricing.fixture.js';

// "Comprar e segurar" compra com todo o saldo na abertura seguinte ao primeiro sinal.
function buyBenchmark(draft: WalletDraft, context: WalletContext): void {
  const { state } = draft;
  if (state.benchmark !== null || state.firstSignalCandleOpenTime === null) return;
  const { run } = context;
  const initial = toEngineDecimal(run.initialBalance);
  const price = marketBuyPrice(context.candle.open, run);
  const budget = moneyDown(initial.dividedBy(new EngineDecimal(1).plus(run.feeRate)));
  const quantity = stepDown(budget.dividedBy(price), run);
  const notional = quantity.times(price);
  const cash = initial.minus(moneyUp(notional)).minus(feeOf(notional, run));
  draft.state = {
    ...state,
    benchmark: { quantity: formatEngineDecimal(quantity), cash: formatEngineDecimal(cash) },
  };
}

function equityPoint(draft: WalletDraft, context: WalletContext): EquityPointDecision {
  const { state } = draft;
  const { run, candle } = context;
  const quantity = toEngineDecimal(state.position?.quantity ?? '0');
  const cash = toEngineDecimal(state.cash);
  const benchmark =
    state.benchmark === null
      ? toEngineDecimal(run.initialBalance)
      : toEngineDecimal(state.benchmark.cash).plus(
          liquidationValue({
            quantity: toEngineDecimal(state.benchmark.quantity),
            price: candle.close,
            run,
          }),
        );
  return {
    candleOpenTime: candle.openTime,
    equity: formatEngineDecimal(
      cash.plus(liquidationValue({ quantity, price: candle.close, run })),
    ),
    equityAtLow: formatEngineDecimal(
      cash.plus(liquidationValue({ quantity, price: candle.low, run })),
    ),
    benchmark: formatEngineDecimal(benchmark),
  };
}

export function runReferenceWalletStep(
  input: WalletStepInput,
  defect: ReferenceEngineDefect,
): WalletStepResult {
  guardInput(defect, () => assertWalletStepInput(input));
  if ((input.executionReports?.length ?? 0) > 0) {
    throw new EngineInputError({
      code: ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED,
      message: 'A referência só simula: relatórios da corretora são da spec 002.',
    });
  }
  const context: WalletContext = {
    config: input.strategy.config,
    run: input.run.parameters,
    candle: input.candle,
    defect,
  };
  const draft: WalletDraft = {
    state: input.state,
    commands: [],
    orders: [],
    fills: [],
    openedPositions: [],
    closedPositions: [],
    isIntraCandleEntry: false,
  };
  executePendingOrder(draft, context);
  evaluateProtectiveExits(draft, context);
  buyBenchmark(draft, context);
  if (input.signal !== null && draft.state.firstSignalCandleOpenTime === null) {
    draft.state = { ...draft.state, firstSignalCandleOpenTime: input.candle.openTime };
  }
  applyClose(draft, context, { signal: input.signal, commands: input.commands ?? [] });
  const equity = input.signal === null ? null : equityPoint(draft, context);
  const { commands, orders, fills, openedPositions, closedPositions } = draft;
  return {
    state: { ...draft.state, lastCandleOpenTime: input.candle.openTime },
    decisions: { commands, orders, fills, openedPositions, closedPositions, equityPoint: equity },
  };
}
