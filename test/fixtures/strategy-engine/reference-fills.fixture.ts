// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
  type EngineDecimalValue,
  type ExitReason,
  type OrderEvent,
  type PendingOrderState,
} from '../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from './reference-engine-defect.fixture.js';
import {
  orderEvent,
  protectiveExitEvents,
  requireText,
  takeKey,
  type WalletContext,
  type WalletDraft,
} from './reference-orders.fixture.js';
import {
  feeOf,
  formatEngineDecimal,
  marketBuyPrice,
  marketSellPrice,
  moneyDown,
  moneyUp,
  stopExitPrice,
  tickUp,
  toEngineDecimal,
} from './reference-pricing.fixture.js';
import { sizeEntry, type SizedEntry } from './reference-sizing.fixture.js';

type EntryFill = { readonly order: PendingOrderState; readonly price: EngineDecimalValue };
export type ExitFill = {
  readonly price: EngineDecimalValue;
  readonly reason: ExitReason;
  readonly events: (quantity: string) => OrderEvent[];
};

function strategyFee(notional: EngineDecimalValue, context: WalletContext): EngineDecimalValue {
  if (context.defect === REFERENCE_ENGINE_DEFECT.IGNORES_FEE) return new EngineDecimal(0);
  return feeOf(notional, context.run);
}

export function openPosition(draft: WalletDraft, fill: EntryFill, context: WalletContext): void {
  const sized = sizeEntry({ draft, context, order: fill.order, price: fill.price });
  if (sized.kind === 'rejected') {
    draft.orders.push(
      orderEvent({
        order: fill.order,
        context,
        status: ORDER_STATUS.REJECTED,
        reason: sized.reason,
      }),
    );
    return;
  }
  recordOpening(draft, context, fill, sized);
}

function recordOpening(
  draft: WalletDraft,
  context: WalletContext,
  fill: EntryFill,
  sized: SizedEntry,
): void {
  const notional = sized.quantity.times(fill.price);
  const fee = strategyFee(notional, context);
  const positionKey =
    context.defect === REFERENCE_ENGINE_DEFECT.READS_CLOCK
      ? `position-${Date.now()}`
      : takeKey(draft, 'position');
  const position = {
    positionKey,
    openedCandleOpenTime: context.candle.openTime,
    entryPrice: formatEngineDecimal(fill.price),
    quantity: formatEngineDecimal(sized.quantity),
    stopPrice: formatEngineDecimal(sized.stop),
    targetPrice: formatEngineDecimal(sized.target),
    entryFee: formatEngineDecimal(fee),
  };
  const cash = toEngineDecimal(draft.state.cash).minus(moneyUp(notional)).minus(fee);
  draft.state = { ...draft.state, cash: formatEngineDecimal(cash), position };
  draft.orders.push(
    orderEvent({
      order: fill.order,
      context,
      status: ORDER_STATUS.FILLED,
      price: position.entryPrice,
      quantity: position.quantity,
      reason: sized.isVolumeCapped ? ORDER_EVENT_REASON.VOLUME_CAPPED : null,
    }),
  );
  draft.fills.push({
    orderKey: fill.order.orderKey,
    positionKey,
    candleOpenTime: context.candle.openTime,
    side: ORDER_SIDE.BUY,
    price: position.entryPrice,
    quantity: position.quantity,
    notional: formatEngineDecimal(notional),
    fee: position.entryFee,
  });
  const { positionKey: key, entryPrice, quantity, stopPrice, targetPrice, entryFee } = position;
  draft.openedPositions.push({
    positionKey: key,
    candleOpenTime: context.candle.openTime,
    entryPrice,
    quantity,
    stopPrice,
    targetPrice,
    entryFee,
  });
}

export function closePosition(draft: WalletDraft, exit: ExitFill, context: WalletContext): void {
  const position = draft.state.position;
  if (position === null) throw new Error('Saída sem posição aberta.');
  const quantity = toEngineDecimal(position.quantity);
  const notional = quantity.times(exit.price);
  const fee = strategyFee(notional, context);
  const credit = moneyDown(notional).minus(fee);
  const entryCost = moneyUp(quantity.times(toEngineDecimal(position.entryPrice))).plus(
    toEngineDecimal(position.entryFee),
  );
  const events = exit.events(position.quantity);
  draft.orders.push(...events);
  const orderKey = events.at(-1)?.orderKey ?? '';
  draft.fills.push({
    orderKey,
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

export function entryMarketPrice(context: WalletContext, open: string): EngineDecimalValue {
  if (context.defect === REFERENCE_ENGINE_DEFECT.IGNORES_SLIPPAGE) {
    return tickUp(toEngineDecimal(open), context.run);
  }
  return marketBuyPrice(open, context.run);
}

function requireEligible(order: PendingOrderState): number {
  if (order.eligibleCandles === null) throw new Error('Ordem limitada sem validade.');
  return order.eligibleCandles;
}

function advanceLimitOrder(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  const eligible = requireEligible(order);
  const { defect } = context;
  const remaining =
    defect === REFERENCE_ENGINE_DEFECT.LIMIT_NEVER_EXPIRES ? eligible : eligible - 1;
  const expiresAt = defect === REFERENCE_ENGINE_DEFECT.LIMIT_EXPIRES_OFF_BY_ONE ? 1 : 0;
  if (remaining > expiresAt) {
    draft.state = { ...draft.state, pendingOrder: { ...order, eligibleCandles: remaining } };
    return;
  }
  draft.state = { ...draft.state, pendingOrder: null };
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.EXPIRED }));
}

function isFirstEligibleCandle(order: PendingOrderState, context: WalletContext): boolean {
  const { entry } = context.config;
  return entry.orderType === ORDER_TYPE.LIMIT && order.eligibleCandles === entry.expiryCandles;
}

// Limitada: melhora de preço só no primeiro candle elegível (abertura abaixo do limite); depois, a
// ordem já está no livro e preenche a L, nunca melhor. No meio do candle, só se a mínima CRUZAR L.
function executeLimitOrder(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  const { candle, defect } = context;
  const limit = toEngineDecimal(requireText(order.limitPrice, 'preço limite'));
  if (toEngineDecimal(candle.open).lte(limit)) {
    draft.state = { ...draft.state, pendingOrder: null };
    const improved = EngineDecimal.min(limit, entryMarketPrice(context, candle.open));
    const price = isFirstEligibleCandle(order, context) ? improved : limit;
    return openPosition(draft, { order, price }, context);
  }
  const low = toEngineDecimal(candle.low);
  const crosses =
    defect === REFERENCE_ENGINE_DEFECT.LIMIT_FILLS_ON_TOUCH ? low.lte(limit) : low.lessThan(limit);
  if (crosses) {
    draft.state = { ...draft.state, pendingOrder: null };
    openPosition(draft, { order, price: limit }, context);
    draft.isIntraCandleEntry = draft.state.position !== null;
    return;
  }
  advanceLimitOrder(draft, order, context);
}

function executePendingExit(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  draft.state = { ...draft.state, pendingOrder: null };
  const price = marketSellPrice(context.candle.open, context.run);
  closePosition(
    draft,
    {
      price,
      reason: order.exitReason ?? EXIT_REASON.SIGNAL,
      events: (quantity) => [
        orderEvent({
          order,
          context,
          status: ORDER_STATUS.FILLED,
          price: formatEngineDecimal(price),
          quantity,
        }),
      ],
    },
    context,
  );
}

// Ordem pendente decidida no fechamento anterior: mercado na abertura, limitada se o candle cruzar.
export function executePendingOrder(draft: WalletDraft, context: WalletContext): void {
  const order = draft.state.pendingOrder;
  if (order === null) return;
  if (order.side === ORDER_SIDE.SELL) return executePendingExit(draft, order, context);
  if (order.type === ORDER_TYPE.MARKET) {
    draft.state = { ...draft.state, pendingOrder: null };
    openPosition(draft, { order, price: entryMarketPrice(context, context.candle.open) }, context);
    return;
  }
  executeLimitOrder(draft, order, context);
}

function closeProtective(
  draft: WalletDraft,
  context: WalletContext,
  exit: {
    readonly price: EngineDecimalValue;
    readonly reason: ExitReason;
    readonly trigger: string;
  },
): void {
  const orderKey = takeKey(draft, 'order');
  const type = exit.reason === EXIT_REASON.STOP ? ORDER_TYPE.STOP : ORDER_TYPE.TARGET;
  const price = formatEngineDecimal(exit.price);
  closePosition(
    draft,
    {
      price: exit.price,
      reason: exit.reason,
      events: (quantity) =>
        protectiveExitEvents({
          orderKey,
          context,
          type,
          triggerPrice: exit.trigger,
          price,
          quantity,
        }),
    },
    context,
  );
}

function closeAtStop(draft: WalletDraft, context: WalletContext, stop: string): void {
  const { candle, run, defect } = context;
  const isGap = toEngineDecimal(candle.open).lte(stop);
  const price =
    isGap && defect === REFERENCE_ENGINE_DEFECT.STOP_PRICE_ON_GAP
      ? marketSellPrice(stop, run)
      : stopExitPrice(stop, candle.open, run);
  closeProtective(draft, context, { price, reason: EXIT_REASON.STOP, trigger: stop });
}

function closeAtTarget(draft: WalletDraft, context: WalletContext, isGap: boolean): void {
  const target = draft.state.position?.targetPrice ?? '0';
  const isAtOpen = isGap && context.defect === REFERENCE_ENGINE_DEFECT.GAP_TARGET_AT_OPEN;
  const price = toEngineDecimal(isAtOpen ? context.candle.open : target);
  closeProtective(draft, context, { price, reason: EXIT_REASON.TARGET, trigger: target });
}

function isTargetPassed(
  draft: WalletDraft,
  context: WalletContext,
  target: EngineDecimalValue,
): boolean {
  const { candle, defect } = context;
  const high = toEngineDecimal(candle.high);
  const passes =
    defect === REFERENCE_ENGINE_DEFECT.TARGET_ON_TOUCH
      ? high.gte(target)
      : high.greaterThan(target);
  const isEntryCandle = draft.state.position?.openedCandleOpenTime === candle.openTime;
  const isBlocked =
    isEntryCandle &&
    draft.isIntraCandleEntry &&
    defect !== REFERENCE_ENGINE_DEFECT.INTRA_CANDLE_LIMIT_TARGET;
  return passes && !isBlocked;
}

// Stop no toque, alvo só se o candle passar dele; os dois no mesmo candle: vale o stop (lado pior).
// Gap acima do alvo: a ordem de alvo está no livro e preenche ao preço do alvo.
export function evaluateProtectiveExits(draft: WalletDraft, context: WalletContext): void {
  const position = draft.state.position;
  if (position === null) return;
  const { candle } = context;
  const stop = toEngineDecimal(position.stopPrice);
  const target = toEngineDecimal(position.targetPrice);
  const open = toEngineDecimal(candle.open);
  const isEntryCandle = position.openedCandleOpenTime === candle.openTime;
  if (!isEntryCandle && open.lte(stop)) return closeAtStop(draft, context, position.stopPrice);
  if (!isEntryCandle && open.greaterThan(target)) return closeAtTarget(draft, context, true);
  const isStopHit = toEngineDecimal(candle.low).lte(stop);
  const isTargetHit = isTargetPassed(draft, context, target);
  if (context.defect === REFERENCE_ENGINE_DEFECT.TARGET_BEFORE_STOP && isTargetHit) {
    return closeAtTarget(draft, context, false);
  }
  if (isStopHit) return closeAtStop(draft, context, position.stopPrice);
  if (isTargetHit) closeAtTarget(draft, context, false);
}
