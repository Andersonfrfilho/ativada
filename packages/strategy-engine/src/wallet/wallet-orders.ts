// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OrderEvent } from '../engine-decision.types.js';
import type { PendingOrderState } from '../engine-state.types.js';
import {
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  type OrderEventReason,
  type OrderStatus,
  type OrderType,
} from '../engine-vocabulary.constant.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

// O esquema do estado garante o campo; a leitura falha em voz alta se algum dia deixar de garantir.
export function requireText(value: string | null, name: string): string {
  if (value === null) throw new StrategyEngineError(`Ordem pendente sem ${name}.`);
  return value;
}

// Chave determinística (`<prefixo>order-N`, `<prefixo>position-N`): refazer o passo repete as chaves.
export function takeKey(draft: WalletDraft, prefix: string): string {
  const key = `${draft.state.keyPrefix}${prefix}-${draft.state.sequence}`;
  draft.state = { ...draft.state, sequence: draft.state.sequence + 1 };
  return key;
}

export type OrderEventParams = {
  readonly order: PendingOrderState;
  readonly candleOpenTime: number;
  readonly status: OrderStatus;
  readonly reason?: OrderEventReason | null;
  readonly price?: string;
  readonly quantity?: string;
};

export function buildOrderEvent(params: OrderEventParams): OrderEvent {
  const { order } = params;
  return {
    orderKey: order.orderKey,
    candleOpenTime: params.candleOpenTime,
    status: params.status,
    side: order.side,
    type: order.type,
    purpose: order.purpose,
    createdCandleOpenTime: order.createdCandleOpenTime,
    limitPrice: order.limitPrice,
    triggerPrice: null,
    price: params.price ?? null,
    quantity: params.quantity ?? null,
    riskAmount: order.riskAmount,
    stopDistance: order.stopDistance,
    targetDistance: order.targetDistance,
    eligibleCandles: order.eligibleCandles,
    reason: params.reason ?? null,
  };
}

export type RecordOrderParams = Omit<OrderEventParams, 'candleOpenTime'>;

export function recordOrder(
  draft: WalletDraft,
  context: WalletContext,
  params: RecordOrderParams,
): void {
  draft.orders.push(buildOrderEvent({ ...params, candleOpenTime: context.candle.openTime }));
}

export type ProtectiveExitParams = {
  readonly orderKey: string;
  readonly candleOpenTime: number;
  readonly type: OrderType;
  readonly triggerPrice: string;
  readonly price: string;
  readonly quantity: string;
};

// Saída protetora (stop ou alvo) nasce e preenche no mesmo candle: dois eventos, preço só no `filled`.
export function buildProtectiveExitEvents(params: ProtectiveExitParams): OrderEvent[] {
  const created: OrderEvent = {
    orderKey: params.orderKey,
    candleOpenTime: params.candleOpenTime,
    status: ORDER_STATUS.CREATED,
    side: ORDER_SIDE.SELL,
    type: params.type,
    purpose: ORDER_PURPOSE.EXIT,
    createdCandleOpenTime: params.candleOpenTime,
    limitPrice: null,
    triggerPrice: params.triggerPrice,
    price: null,
    quantity: null,
    riskAmount: null,
    stopDistance: null,
    targetDistance: null,
    eligibleCandles: null,
    reason: null,
  };
  const filled = {
    ...created,
    status: ORDER_STATUS.FILLED,
    price: params.price,
    quantity: params.quantity,
  };
  return [created, filled];
}
