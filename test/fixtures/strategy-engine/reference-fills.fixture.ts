// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
  type ClosedPositionDecision,
  type EngineCandle,
  type EngineDecimalValue,
  type EngineState,
  type ExitReason,
  type FillDecision,
  type OpenedPositionDecision,
  type OrderEvent,
  type OrderEventReason,
  type OrderType,
  type PendingOrderState,
  type StrategyConfig,
} from '../../../packages/strategy-engine/src/index.js';
import {
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './reference-engine-defect.fixture.js';
import {
  feeOf,
  formatEngineDecimal,
  marketBuyPrice,
  marketSellPrice,
  moneyDown,
  moneyUp,
  stepDown,
  tickDown,
  tickUp,
  toEngineDecimal,
} from './reference-pricing.fixture.js';

export type ReferenceDraft = {
  state: EngineState;
  readonly orders: OrderEvent[];
  readonly fills: FillDecision[];
  readonly openedPositions: OpenedPositionDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  isIntraCandleEntry: boolean;
};

export type ReferenceContext = {
  readonly config: StrategyConfig;
  readonly candle: EngineCandle;
  readonly defect: ReferenceEngineDefect;
};

type EntryFill = { readonly order: PendingOrderState; readonly price: EngineDecimalValue };
type ExitFill = {
  readonly price: EngineDecimalValue;
  readonly reason: ExitReason;
  readonly type: OrderType;
};

export function requireText(value: string | null, name: string): string {
  if (value === null) throw new Error(`Ordem pendente sem ${name}.`);
  return value;
}

export function takeKey(draft: ReferenceDraft, prefix: string): string {
  const key = `${prefix}-${draft.state.sequence}`;
  draft.state = { ...draft.state, sequence: draft.state.sequence + 1 };
  return key;
}

export function orderEvent(params: {
  readonly order: PendingOrderState;
  readonly context: ReferenceContext;
  readonly status: OrderEvent['status'];
  readonly reason?: OrderEventReason;
}): OrderEvent {
  const { order } = params;
  return {
    orderKey: order.orderKey,
    candleOpenTime: params.context.candle.openTime,
    status: params.status,
    side: order.side,
    type: order.type,
    purpose: order.purpose,
    createdCandleOpenTime: order.createdCandleOpenTime,
    limitPrice: order.limitPrice,
    quoteBudget: order.quoteBudget,
    eligibleCandles: order.eligibleCandles,
    reason: params.reason ?? null,
  };
}

function strategyFee(notional: EngineDecimalValue, context: ReferenceContext): EngineDecimalValue {
  if (context.defect === REFERENCE_ENGINE_DEFECT.IGNORES_FEE) return new EngineDecimal(0);
  return feeOf(notional, context.config.execution);
}

function affordableQuantity(
  fill: EntryFill,
  context: ReferenceContext,
  cash: EngineDecimalValue,
): EngineDecimalValue {
  const execution = context.config.execution;
  const step = toEngineDecimal(execution.quantityStep);
  let quantity = stepDown(
    toEngineDecimal(requireText(fill.order.quoteBudget, 'orçamento')).dividedBy(fill.price),
    execution,
  );
  const debitOf = (candidate: EngineDecimalValue): EngineDecimalValue => {
    const notional = candidate.times(fill.price);
    return moneyUp(notional).plus(strategyFee(notional, context));
  };
  while (quantity.greaterThan(0) && debitOf(quantity).greaterThan(cash)) {
    quantity = quantity.minus(step);
  }
  return quantity;
}

function rejectEntry(
  draft: ReferenceDraft,
  fill: EntryFill,
  context: ReferenceContext,
): (reason: OrderEventReason) => void {
  return (reason: OrderEventReason): void => {
    draft.orders.push(
      orderEvent({ order: fill.order, context, status: ORDER_STATUS.REJECTED, reason }),
    );
  };
}

export function openPosition(
  draft: ReferenceDraft,
  fill: EntryFill,
  context: ReferenceContext,
): void {
  const execution = context.config.execution;
  const reject = rejectEntry(draft, fill, context);
  const quantity = affordableQuantity(fill, context, toEngineDecimal(draft.state.cash));
  const notional = quantity.times(fill.price);
  if (quantity.lte(0) || notional.lessThan(toEngineDecimal(execution.minNotional))) {
    reject(ORDER_EVENT_REASON.BELOW_MIN_NOTIONAL);
    return;
  }
  const stopDistance = toEngineDecimal(requireText(fill.order.stopDistance, 'distância do stop'));
  const stop = tickDown(fill.price.minus(stopDistance), execution);
  if (stop.lte(0)) {
    reject(ORDER_EVENT_REASON.INVALID_STOP);
    return;
  }
  const targetDistance = toEngineDecimal(
    requireText(fill.order.targetDistance, 'distância do alvo'),
  );
  recordOpening(draft, context, {
    order: fill.order,
    price: fill.price,
    quantity,
    stop,
    target: tickUp(fill.price.plus(targetDistance), execution),
  });
}

function recordOpening(
  draft: ReferenceDraft,
  context: ReferenceContext,
  opening: EntryFill & {
    readonly quantity: EngineDecimalValue;
    readonly stop: EngineDecimalValue;
    readonly target: EngineDecimalValue;
  },
): void {
  const notional = opening.quantity.times(opening.price);
  const fee = strategyFee(notional, context);
  const positionKey =
    context.defect === REFERENCE_ENGINE_DEFECT.READS_CLOCK
      ? `position-${Date.now()}`
      : takeKey(draft, 'position');
  const position = {
    positionKey,
    openedCandleOpenTime: context.candle.openTime,
    entryPrice: formatEngineDecimal(opening.price),
    quantity: formatEngineDecimal(opening.quantity),
    stopPrice: formatEngineDecimal(opening.stop),
    targetPrice: formatEngineDecimal(opening.target),
    entryFee: formatEngineDecimal(fee),
  };
  const cash = toEngineDecimal(draft.state.cash).minus(moneyUp(notional)).minus(fee);
  draft.state = { ...draft.state, cash: formatEngineDecimal(cash), position };
  draft.orders.push(orderEvent({ order: opening.order, context, status: ORDER_STATUS.FILLED }));
  draft.fills.push({
    orderKey: opening.order.orderKey,
    positionKey,
    candleOpenTime: context.candle.openTime,
    side: ORDER_SIDE.BUY,
    price: position.entryPrice,
    quantity: position.quantity,
    notional: formatEngineDecimal(notional),
    fee: position.entryFee,
  });
  draft.openedPositions.push({
    positionKey,
    candleOpenTime: context.candle.openTime,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    stopPrice: position.stopPrice,
    targetPrice: position.targetPrice,
    entryFee: position.entryFee,
  });
}

export function closePosition(
  draft: ReferenceDraft,
  exit: ExitFill,
  context: ReferenceContext,
): void {
  const position = draft.state.position;
  if (position === null) throw new Error('Saída sem posição aberta.');
  const quantity = toEngineDecimal(position.quantity);
  const notional = quantity.times(exit.price);
  const fee = strategyFee(notional, context);
  const credit = moneyDown(notional).minus(fee);
  const entryCost = moneyUp(quantity.times(toEngineDecimal(position.entryPrice))).plus(
    toEngineDecimal(position.entryFee),
  );
  const exitOrder: PendingOrderState = {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.SELL,
    type: ORDER_TYPE.MARKET,
    purpose: ORDER_PURPOSE.EXIT,
    createdCandleOpenTime: context.candle.openTime,
    limitPrice: formatEngineDecimal(exit.price),
    quoteBudget: null,
    stopDistance: null,
    targetDistance: null,
    eligibleCandles: null,
    exitReason: exit.reason,
  };
  draft.orders.push({
    ...orderEvent({ order: exitOrder, context, status: ORDER_STATUS.FILLED }),
    type: exit.type,
  });
  draft.fills.push({
    orderKey: exitOrder.orderKey,
    positionKey: position.positionKey,
    candleOpenTime: context.candle.openTime,
    side: ORDER_SIDE.SELL,
    price: formatEngineDecimal(exit.price),
    quantity: position.quantity,
    notional: formatEngineDecimal(notional),
    fee: formatEngineDecimal(fee),
  });
  draft.closedPositions.push({
    positionKey: position.positionKey,
    openedCandleOpenTime: position.openedCandleOpenTime,
    candleOpenTime: context.candle.openTime,
    entryPrice: position.entryPrice,
    exitPrice: formatEngineDecimal(exit.price),
    quantity: position.quantity,
    entryFee: position.entryFee,
    exitFee: formatEngineDecimal(fee),
    netProfit: formatEngineDecimal(credit.minus(entryCost)),
    exitReason: exit.reason,
  });
  const cash = toEngineDecimal(draft.state.cash).plus(credit);
  draft.state = { ...draft.state, cash: formatEngineDecimal(cash), position: null };
}

function entryMarketPrice(context: ReferenceContext): EngineDecimalValue {
  if (context.defect === REFERENCE_ENGINE_DEFECT.IGNORES_SLIPPAGE) {
    return tickUp(toEngineDecimal(context.candle.open), context.config.execution);
  }
  return marketBuyPrice(context.candle.open, context.config.execution);
}

function advanceLimitOrder(
  draft: ReferenceDraft,
  order: PendingOrderState,
  context: ReferenceContext,
): void {
  const eligible = requireEligible(order);
  const remaining =
    context.defect === REFERENCE_ENGINE_DEFECT.LIMIT_NEVER_EXPIRES ? eligible : eligible - 1;
  if (remaining > 0) {
    draft.state = { ...draft.state, pendingOrder: { ...order, eligibleCandles: remaining } };
    return;
  }
  draft.state = { ...draft.state, pendingOrder: null };
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.EXPIRED }));
}

function requireEligible(order: PendingOrderState): number {
  if (order.eligibleCandles === null) throw new Error('Ordem limitada sem validade.');
  return order.eligibleCandles;
}

// Ordem pendente decidida no fechamento anterior: mercado na abertura, limitada se o candle cruzar.
export function executePendingOrder(draft: ReferenceDraft, context: ReferenceContext): void {
  const order = draft.state.pendingOrder;
  if (order === null) return;
  if (order.side === ORDER_SIDE.SELL) throw new Error('A referência nunca sai por sinal.');
  if (order.type === ORDER_TYPE.MARKET) {
    draft.state = { ...draft.state, pendingOrder: null };
    openPosition(draft, { order, price: entryMarketPrice(context) }, context);
    return;
  }
  const limit = toEngineDecimal(requireText(order.limitPrice, 'preço limite'));
  const open = toEngineDecimal(context.candle.open);
  if (open.lte(limit)) {
    draft.state = { ...draft.state, pendingOrder: null };
    const price = EngineDecimal.min(limit, entryMarketPrice(context));
    openPosition(draft, { order, price }, context);
    return;
  }
  if (toEngineDecimal(context.candle.low).lessThan(limit)) {
    draft.state = { ...draft.state, pendingOrder: null };
    openPosition(draft, { order, price: limit }, context);
    draft.isIntraCandleEntry = draft.state.position !== null;
    return;
  }
  advanceLimitOrder(draft, order, context);
}

function stopExitPrice(
  context: ReferenceContext,
  stop: string,
  isGap: boolean,
): EngineDecimalValue {
  const usesOpen = isGap && context.defect !== REFERENCE_ENGINE_DEFECT.STOP_PRICE_ON_GAP;
  return marketSellPrice(usesOpen ? context.candle.open : stop, context.config.execution);
}

function closeAtStop(draft: ReferenceDraft, context: ReferenceContext, isGap: boolean): void {
  const stop = draft.state.position?.stopPrice ?? '0';
  const price = stopExitPrice(context, stop, isGap);
  closePosition(draft, { price, reason: EXIT_REASON.STOP, type: ORDER_TYPE.STOP }, context);
}

function closeAtTarget(draft: ReferenceDraft, context: ReferenceContext): void {
  const price = toEngineDecimal(draft.state.position?.targetPrice ?? '0');
  closePosition(draft, { price, reason: EXIT_REASON.TARGET, type: ORDER_TYPE.TARGET }, context);
}

// Stop no toque, alvo só se o candle passar dele; os dois no mesmo candle: vale o stop (lado pior).
export function evaluateProtectiveExits(draft: ReferenceDraft, context: ReferenceContext): void {
  const position = draft.state.position;
  if (position === null) return;
  const { candle } = context;
  const stop = toEngineDecimal(position.stopPrice);
  const target = toEngineDecimal(position.targetPrice);
  const isEntryCandle = position.openedCandleOpenTime === candle.openTime;
  if (!isEntryCandle && toEngineDecimal(candle.open).lte(stop))
    return closeAtStop(draft, context, true);
  if (!isEntryCandle && toEngineDecimal(candle.open).greaterThan(target)) {
    return closeAtTarget(draft, context);
  }
  const isStopHit = toEngineDecimal(candle.low).lte(stop);
  const isTargetHit =
    toEngineDecimal(candle.high).greaterThan(target) &&
    !(isEntryCandle && draft.isIntraCandleEntry);
  if (context.defect === REFERENCE_ENGINE_DEFECT.TARGET_BEFORE_STOP && isTargetHit) {
    return closeAtTarget(draft, context);
  }
  if (isStopHit) return closeAtStop(draft, context, false);
  if (isTargetHit) closeAtTarget(draft, context);
}
