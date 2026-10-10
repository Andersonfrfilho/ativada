// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  type PendingOrderState,
} from '../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from './reference-engine-defect.fixture.js';
import { closePosition } from './reference-fills.fixture.js';
import {
  orderEvent,
  takeKey,
  type WalletContext,
  type WalletDraft,
} from './reference-orders.fixture.js';
import { formatEngineDecimal, stopExitPrice } from './reference-pricing.fixture.js';

function gapExitOrder(draft: WalletDraft, context: WalletContext): PendingOrderState {
  return {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.SELL,
    type: 'market',
    purpose: ORDER_PURPOSE.EXIT,
    createdCandleOpenTime: context.candle.openTime,
    limitPrice: null,
    riskAmount: null,
    stopDistance: null,
    targetDistance: null,
    eligibleCandles: null,
    decisionVolume: null,
    filledQuantity: '0',
    exitReason: EXIT_REASON.GAP,
  };
}

// Lacuna confirmada (ADR 0002 §e): a ordem pendente caduca e o stop é assumido tocado: a posição sai na
// abertura a min(stop, abertura) × (1 − slippage). Escrita à parte da produção, de propósito.
export function applyReferenceGap(draft: WalletDraft, context: WalletContext): void {
  const { defect } = context;
  const pending = draft.state.pendingOrder;
  if (pending !== null && defect !== REFERENCE_ENGINE_DEFECT.GAP_KEEPS_PENDING) {
    draft.state = { ...draft.state, pendingOrder: null };
    draft.orders.push(
      orderEvent({
        order: pending,
        context,
        status: ORDER_STATUS.CANCELLED,
        reason: ORDER_EVENT_REASON.GAP,
      }),
    );
  }
  const position = draft.state.position;
  if (position === null || defect === REFERENCE_ENGINE_DEFECT.GAP_KEEPS_POSITION) return;
  const order = gapExitOrder(draft, context);
  const price = stopExitPrice(position.stopPrice, context.candle.open, context.run);
  const reason = ORDER_EVENT_REASON.GAP;
  closePosition(
    draft,
    {
      price,
      reason: EXIT_REASON.GAP,
      events: (quantity) => [
        orderEvent({ order, context, status: ORDER_STATUS.CREATED, reason }),
        orderEvent({
          order,
          context,
          status: ORDER_STATUS.FILLED,
          reason,
          price: formatEngineDecimal(price),
          quantity,
        }),
      ],
    },
    context,
  );
}

export function isReferenceGapIgnored(context: WalletContext): boolean {
  return (
    context.defect === REFERENCE_ENGINE_DEFECT.GAP_KEEPS_POSITION ||
    context.defect === REFERENCE_ENGINE_DEFECT.GAP_KEEPS_PENDING
  );
}
