// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AppliedCommandDecision,
  ClosedPositionDecision,
  EngineCandle,
  FillDecision,
  OpenedPositionDecision,
  OrderEvent,
  OrderEventReason,
  OrderStatus,
  OrderType,
  PendingOrderState,
  RunParameters,
  StrategyConfig,
  WalletState,
} from '../../../packages/strategy-engine/src/index.js';
import type { ReferenceEngineDefect } from './reference-engine-defect.fixture.js';

export type WalletDraft = {
  state: WalletState;
  readonly commands: AppliedCommandDecision[];
  readonly orders: OrderEvent[];
  readonly fills: FillDecision[];
  readonly openedPositions: OpenedPositionDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  isIntraCandleEntry: boolean;
};

export type WalletContext = {
  readonly config: StrategyConfig;
  readonly run: RunParameters;
  readonly candle: EngineCandle;
  readonly defect: ReferenceEngineDefect;
};

export function requireText(value: string | null, name: string): string {
  if (value === null) throw new Error(`Ordem pendente sem ${name}.`);
  return value;
}

export function takeKey(draft: WalletDraft, prefix: string): string {
  const key = `${draft.state.keyPrefix}${prefix}-${draft.state.sequence}`;
  draft.state = { ...draft.state, sequence: draft.state.sequence + 1 };
  return key;
}

export function orderEvent(params: {
  readonly order: PendingOrderState;
  readonly context: WalletContext;
  readonly status: OrderStatus;
  readonly reason?: OrderEventReason | null;
  readonly price?: string;
  readonly quantity?: string;
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

// Saída protetora (stop ou alvo) nasce e preenche no mesmo candle: dois eventos, preço só no `filled`.
export function protectiveExitEvents(params: {
  readonly orderKey: string;
  readonly context: WalletContext;
  readonly type: OrderType;
  readonly triggerPrice: string;
  readonly price: string;
  readonly quantity: string;
}): OrderEvent[] {
  const created: OrderEvent = {
    orderKey: params.orderKey,
    candleOpenTime: params.context.candle.openTime,
    status: 'created',
    side: 'sell',
    type: params.type,
    purpose: 'exit',
    createdCandleOpenTime: params.context.candle.openTime,
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
  return [
    created,
    { ...created, status: 'filled', price: params.price, quantity: params.quantity },
  ];
}
