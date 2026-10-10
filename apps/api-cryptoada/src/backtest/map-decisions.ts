// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CommandInput,
  EquityPointInput,
  FillInput,
  OrderInput,
  SignalInput,
} from '@cryptoada/database';
import type {
  AppliedCommandDecision,
  EquityPointDecision,
  FillDecision,
  OrderEvent,
  SignalDecision,
} from '@cryptoada/strategy-engine';

// Tradução 1:1 do que o motor decide para as linhas dos repositórios (ADR 0002 §a, tabela de `decisions`).
export function mapSignal(signal: SignalDecision): SignalInput {
  return {
    candleTime: signal.candleOpenTime,
    action: signal.action,
    score: signal.score,
    regime: signal.regime,
    votes: signal.votes,
    indicators: signal.indicators,
    sentimentObservation: signal.sentiment ?? undefined,
    reason: signal.reason,
  };
}

// Um evento por linha: o repositório junta os eventos da mesma ordem pelo status mais avançado.
export function mapOrderEvent(event: OrderEvent): OrderInput {
  return {
    engineKey: event.orderKey,
    side: event.side,
    type: event.type,
    purpose: event.purpose,
    status: event.status,
    reason: event.reason ?? undefined,
    quantity: event.quantity ?? undefined,
    price: event.price ?? undefined,
    limitPrice: event.limitPrice ?? undefined,
    triggerPrice: event.triggerPrice ?? undefined,
    riskAmount: event.riskAmount ?? undefined,
    stopDistance: event.stopDistance ?? undefined,
    targetDistance: event.targetDistance ?? undefined,
    eligibleCandles: event.eligibleCandles ?? undefined,
    createdCandleTime: event.createdCandleOpenTime,
    expiresCandleTime: undefined,
    lastEventCandleTime: event.candleOpenTime,
  };
}

export function mapFill(fill: FillDecision): FillInput {
  return {
    orderKey: fill.orderKey,
    positionKey: fill.positionKey,
    candleTime: fill.candleOpenTime,
    side: fill.side,
    price: fill.price,
    quantity: fill.quantity,
    notional: fill.notional,
    fee: fill.fee,
  };
}

export function mapEquityPoint(point: EquityPointDecision): EquityPointInput {
  return {
    candleTime: point.candleOpenTime,
    equity: point.equity,
    equityAtLow: point.equityAtLow,
    benchmark: point.benchmark,
  };
}

export function mapCommand(command: AppliedCommandDecision): CommandInput {
  return {
    commandId: command.commandId,
    kind: command.kind,
    reason: command.reason,
    issuedAt: command.issuedAt,
    candleTime: command.candleOpenTime,
    status: command.status,
  };
}
