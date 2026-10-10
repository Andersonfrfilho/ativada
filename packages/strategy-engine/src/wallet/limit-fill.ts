// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import type { PendingOrderState } from '../engine-state.types.js';
import { ENTRY_ORDER_TYPE, ORDER_STATUS } from '../engine-vocabulary.constant.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import { openPosition } from './entry-fill.js';
import { recordOrder, requireText } from './wallet-orders.js';
import { marketBuyPrice } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

function requireEligibleCandles(order: PendingOrderState): number {
  if (order.eligibleCandles === null) throw new StrategyEngineError('Ordem limitada sem validade.');
  return order.eligibleCandles;
}

// Um candle elegível a menos; ao zerar, `expired` naquele candle (exatamente o N-ésimo).
function consumeEligibleCandle(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  const remaining = requireEligibleCandles(order) - 1;
  if (remaining > 0) {
    draft.state = { ...draft.state, pendingOrder: { ...order, eligibleCandles: remaining } };
    return;
  }
  draft.state = { ...draft.state, pendingOrder: null };
  recordOrder(draft, context, { order, status: ORDER_STATUS.EXPIRED });
}

function isFirstEligibleCandle(order: PendingOrderState, context: WalletContext): boolean {
  const { entry } = context.config;
  return (
    entry.orderType === ENTRY_ORDER_TYPE.LIMIT && order.eligibleCandles === entry.expiryCandles
  );
}

// Limitada: melhora de preço `min(L, abertura × (1 + s))` só no primeiro candle elegível (a ordem chega ao
// livro já com o preço abaixo); do 2º em diante ela está no livro e preenche a `L`, nunca melhor. Se a
// abertura está acima, só preenche se a mínima CRUZAR `L` (tocar não basta), no meio do candle.
export function executeLimitOrder(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  const { candle, parameters } = context;
  const limit = toEngineDecimal(requireText(order.limitPrice, 'preço limite'));
  if (toEngineDecimal(candle.open).lte(limit)) {
    draft.state = { ...draft.state, pendingOrder: null };
    const improved = EngineDecimal.min(limit, marketBuyPrice(candle.open, parameters));
    const price = isFirstEligibleCandle(order, context) ? improved : limit;
    return openPosition(draft, { order, price }, context);
  }
  if (toEngineDecimal(candle.low).lessThan(limit)) {
    draft.state = { ...draft.state, pendingOrder: null };
    openPosition(draft, { order, price: limit }, context);
    draft.isIntraCandleEntry = draft.state.position !== null;
    return;
  }
  consumeEligibleCandle(draft, order, context);
}
