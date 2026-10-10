// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal } from '../engine-decimal.js';
import type { PendingOrderState } from '../engine-state.types.js';
import {
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
} from '../engine-vocabulary.constant.js';
import { closePosition } from './exit-fill.js';
import { buildOrderEvent, recordOrder, takeKey } from './wallet-orders.js';
import { stopExitPrice } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

function gapExitOrder(draft: WalletDraft, context: WalletContext): PendingOrderState {
  return {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.SELL,
    type: ENTRY_ORDER_TYPE.MARKET,
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

// Nenhuma ordem decidida antes da lacuna sobrevive a ela: o preço em que foi pensada ficou para trás.
function cancelPendingOrder(draft: WalletDraft, context: WalletContext): void {
  const order = draft.state.pendingOrder;
  if (order === null) return;
  draft.state = { ...draft.state, pendingOrder: null };
  recordOrder(draft, context, {
    order,
    status: ORDER_STATUS.CANCELLED,
    reason: ORDER_EVENT_REASON.GAP,
  });
}

// O stop é assumido tocado durante a lacuna: sai na abertura a min(stop, abertura) × (1 − slippage).
function closeOnGap(draft: WalletDraft, context: WalletContext): void {
  const position = draft.state.position;
  if (position === null) return;
  const order = gapExitOrder(draft, context);
  const price = stopExitPrice(
    { stop: position.stopPrice, open: context.candle.open },
    context.parameters,
  );
  const { openTime } = context.candle;
  const reason = ORDER_EVENT_REASON.GAP;
  closePosition(
    draft,
    {
      price,
      reason: EXIT_REASON.GAP,
      events: (quantity) => [
        buildOrderEvent({ order, candleOpenTime: openTime, status: ORDER_STATUS.CREATED, reason }),
        buildOrderEvent({
          order,
          candleOpenTime: openTime,
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

// Passos 1 e 2 do candle quando há lacuna confirmada antes dele: no lugar do modelo de preenchimento.
export function applyConfirmedGap(draft: WalletDraft, context: WalletContext): void {
  cancelPendingOrder(draft, context);
  closeOnGap(draft, context);
}
