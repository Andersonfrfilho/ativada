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
import { referencePositionSize } from './risk/reference-risk.fixture.js';
import {
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

// R3 (arquiteto): o volume que vale é o do candle de DECISÃO `t`; o do preenchimento é desconhecido na
// abertura. O defeito VOLUME_OF_FILL_CANDLE usa o do candle `k` (o que o executor real não tem).
function volumeOfSizing(input: SizingInput): EngineDecimalValue {
  if (input.context.defect === REFERENCE_ENGINE_DEFECT.VOLUME_OF_FILL_CANDLE) {
    return toEngineDecimal(input.context.candle.volume);
  }
  return toEngineDecimal(requireText(input.order.decisionVolume, 'volume de decisão'));
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

type SizedQuantity = { readonly quantity: EngineDecimalValue; readonly isVolumeCapped: boolean };

// Motores defeituosos de tamanho: fórmulas erradas de propósito, sem a folga de arredondamento.
function sizeWrongly(input: SizingInput, stop: EngineDecimalValue): SizedQuantity {
  const { run } = input.context;
  const riskAmount = toEngineDecimal(requireText(input.order.riskAmount, 'valor em risco'));
  const byRisk = stepDown(riskAmount.dividedBy(riskPerUnit(input, stop)), run);
  const byVolume = stepDown(volumeOfSizing(input).times(run.maxVolumeShare), run);
  const unbounded = EngineDecimal.min(byRisk, cashBound(input));
  return {
    quantity: EngineDecimal.min(unbounded, byVolume),
    isVolumeCapped: byVolume.lessThan(unbounded),
  };
}

// Caminho correto: o oráculo puro do risco (a mesma fórmula que a produção, T2.4, é provada contra).
function sizeCorrectly(input: SizingInput, stop: EngineDecimalValue): SizedQuantity {
  const { run, config } = input.context;
  const cash = input.draft.state.cash;
  const result = referencePositionSize({
    riskAmount: requireText(input.order.riskAmount, 'valor em risco'),
    entryPrice: formatEngineDecimal(input.price),
    stopPrice: formatEngineDecimal(stop),
    feeRate: run.feeRate,
    slippageRate: run.slippageRate,
    cash,
    equity: cash,
    maxExposureRate: config.risk.maxExposureRate,
    candleVolume: formatEngineDecimal(volumeOfSizing(input)),
    maxVolumeShare: run.maxVolumeShare,
    quantityStep: run.quantityStep,
    tickSize: run.tickSize,
    minNotional: run.minNotional,
  });
  return {
    quantity: toEngineDecimal(result.quantity),
    isVolumeCapped: result.constraint === ORDER_EVENT_REASON.VOLUME_CAPPED,
  };
}

export function sizeEntry(input: SizingInput): SizedEntry | RejectedEntry {
  const { run } = input.context;
  const base = protectionBase(input);
  const stop = tickDown(
    base.minus(requireText(input.order.stopDistance, 'distância do stop')),
    run,
  );
  const highestStop = input.price.times(ONE.minus(run.slippageRate));
  if (stop.lte(0) || stop.gte(highestStop)) {
    return { kind: 'rejected', reason: ORDER_EVENT_REASON.INVALID_STOP };
  }
  const sized = isSizedWrong(input) ? sizeWrongly(input, stop) : sizeCorrectly(input, stop);
  if (sized.quantity.lte(0) || sized.quantity.times(input.price).lessThan(run.minNotional)) {
    return { kind: 'rejected', reason: ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL };
  }
  const targetDistance = requireText(input.order.targetDistance, 'distância do alvo');
  return {
    kind: 'sized',
    quantity: sized.quantity,
    stop,
    target: tickUp(base.plus(targetDistance), run),
    isVolumeCapped: sized.isVolumeCapped,
  };
}
