// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  ORDER_EVENT_REASON,
  type EngineDecimalValue,
  type OrderEventReason,
  type PendingOrderState,
} from '../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from './reference-engine-defect.fixture.js';
import { requireText, type WalletContext, type WalletDraft } from './reference-orders.fixture.js';
import {
  buyDebit,
  lossAtStop,
  marketSellPrice,
  formatEngineDecimal,
  stepDown,
  tickDown,
  tickUp,
  toEngineDecimal,
} from './reference-pricing.fixture.js';

export type SizedEntry = {
  readonly kind: 'sized';
  readonly quantity: EngineDecimalValue;
  readonly stop: EngineDecimalValue;
  readonly target: EngineDecimalValue;
  readonly isVolumeCapped: boolean;
};

export type RejectedEntry = { readonly kind: 'rejected'; readonly reason: OrderEventReason };

type SizingInput = {
  readonly draft: WalletDraft;
  readonly context: WalletContext;
  readonly order: PendingOrderState;
  readonly price: EngineDecimalValue;
};

const ONE = new EngineDecimal(1);

function rate(text: string): EngineDecimalValue {
  return toEngineDecimal(text);
}

// Defeitos SIZE_AT_DECISION e STOP_FROM_DECISION_CLOSE guardam o fechamento de `t` em `filledQuantity`.
function decisionClose(order: PendingOrderState): EngineDecimalValue {
  return toEngineDecimal(order.filledQuantity);
}

function protectionBase(input: SizingInput): EngineDecimalValue {
  return input.context.defect === REFERENCE_ENGINE_DEFECT.STOP_FROM_DECISION_CLOSE
    ? decisionClose(input.order)
    : input.price;
}

// Risco por unidade até o stop: entrada − saída estimada no stop + taxa de entrada + taxa de saída.
function riskPerUnit(input: SizingInput, stop: EngineDecimalValue): EngineDecimalValue {
  const { run, defect } = input.context;
  if (defect === REFERENCE_ENGINE_DEFECT.IGNORES_FEES_IN_SIZE) return input.price.minus(stop);
  const price =
    defect === REFERENCE_ENGINE_DEFECT.SIZE_AT_DECISION ? decisionClose(input.order) : input.price;
  const priceStop =
    defect === REFERENCE_ENGINE_DEFECT.SIZE_AT_DECISION
      ? tickDown(price.minus(requireText(input.order.stopDistance, 'distância do stop')), run)
      : stop;
  const stopExit = marketSellPrice(formatEngineDecimal(priceStop), run);
  const fee = rate(run.feeRate);
  return price.minus(stopExit).plus(price.times(fee)).plus(stopExit.times(fee));
}

function cashBound(input: SizingInput): EngineDecimalValue {
  const { run, config, defect } = input.context;
  const cash = toEngineDecimal(input.draft.state.cash);
  const exposure = cash.times(config.risk.maxExposureRate);
  if (defect === REFERENCE_ENGINE_DEFECT.OVERSPENDS_CASH)
    return stepDown(exposure.dividedBy(input.price), run);
  const affordable = cash.dividedBy(ONE.plus(run.feeRate));
  return stepDown(EngineDecimal.min(exposure, affordable).dividedBy(input.price), run);
}

function isSizedWrong(input: SizingInput): boolean {
  const { defect } = input.context;
  return (
    defect === REFERENCE_ENGINE_DEFECT.SIZE_AT_DECISION ||
    defect === REFERENCE_ENGINE_DEFECT.IGNORES_FEES_IN_SIZE ||
    defect === REFERENCE_ENGINE_DEFECT.OVERSPENDS_CASH
  );
}

// Arredondamento de dinheiro pode passar o teto por centavos de satoshi: desce passo a passo até caber
// no caixa e no valor em risco (a perda realizada no stop, com as mesmas regras do preenchimento).
function fitQuantity(
  input: SizingInput,
  quantity: EngineDecimalValue,
  stop: EngineDecimalValue,
): EngineDecimalValue {
  const { run } = input.context;
  if (isSizedWrong(input)) return quantity;
  const cash = toEngineDecimal(input.draft.state.cash);
  const riskAmount = toEngineDecimal(requireText(input.order.riskAmount, 'valor em risco'));
  const stopExit = marketSellPrice(formatEngineDecimal(stop), run);
  const step = toEngineDecimal(run.quantityStep);
  let fitted = quantity;
  const exceeds = (candidate: EngineDecimalValue): boolean =>
    buyDebit(candidate.times(input.price), run).greaterThan(cash) ||
    lossAtStop({ quantity: candidate, entryPrice: input.price, stopExit, run }).greaterThan(
      riskAmount,
    );
  while (fitted.greaterThan(0) && exceeds(fitted)) fitted = fitted.minus(step);
  return fitted;
}

export function sizeEntry(input: SizingInput): SizedEntry | RejectedEntry {
  const { run, candle } = input.context;
  const base = protectionBase(input);
  const stop = tickDown(
    base.minus(requireText(input.order.stopDistance, 'distância do stop')),
    run,
  );
  const highestStop = input.price.times(ONE.minus(run.slippageRate));
  if (stop.lte(0) || stop.gte(highestStop)) {
    return { kind: 'rejected', reason: ORDER_EVENT_REASON.INVALID_STOP };
  }
  const riskAmount = toEngineDecimal(requireText(input.order.riskAmount, 'valor em risco'));
  const byRisk = stepDown(riskAmount.dividedBy(riskPerUnit(input, stop)), run);
  const byCash = cashBound(input);
  const byVolume = stepDown(toEngineDecimal(candle.volume).times(run.maxVolumeShare), run);
  const unbounded = EngineDecimal.min(byRisk, byCash);
  const quantity = fitQuantity(input, EngineDecimal.min(unbounded, byVolume), stop);
  if (quantity.lte(0) || quantity.times(input.price).lessThan(run.minNotional)) {
    return { kind: 'rejected', reason: ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL };
  }
  const targetDistance = requireText(input.order.targetDistance, 'distância do alvo');
  return {
    kind: 'sized',
    quantity,
    stop,
    target: tickUp(base.plus(targetDistance), run),
    isVolumeCapped: byVolume.lessThan(unbounded),
  };
}
