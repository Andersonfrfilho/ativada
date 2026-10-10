// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readJsonContainer } from '../jsonb.js';
import type { fills } from '../schema/fills.schema.js';
import type { orders } from '../schema/orders.schema.js';
import type { positions } from '../schema/positions.schema.js';
import type { signals } from '../schema/signals.schema.js';
import type {
  ExitReason,
  OrderPurpose,
  OrderReason,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionStatus,
  Regime,
  SignalAction,
} from './run-result.constant.js';
import type { FillInput, OrderInput, PositionInput, SignalInput } from './run-result.types.js';

export function toSignalInput(row: typeof signals.$inferSelect): SignalInput {
  return {
    candleTime: row.candleTime,
    action: row.action as SignalAction,
    score: row.score,
    regime: row.regime as Regime,
    votes: readJsonContainer(row.votes),
    indicators: readJsonContainer(row.indicators),
    sentimentObservation:
      row.sentimentObservation === null ? undefined : readJsonContainer(row.sentimentObservation),
    reason: row.reason,
  };
}

export function toOrderInput(row: typeof orders.$inferSelect): OrderInput {
  return {
    engineKey: row.engineKey,
    side: row.side as OrderSide,
    type: row.type as OrderType,
    purpose: row.purpose as OrderPurpose,
    status: row.status as OrderStatus,
    reason: (row.reason ?? undefined) as OrderReason | undefined,
    quantity: row.quantity ?? undefined,
    price: row.price ?? undefined,
    limitPrice: row.limitPrice ?? undefined,
    triggerPrice: row.triggerPrice ?? undefined,
    riskAmount: row.riskAmount ?? undefined,
    stopDistance: row.stopDistance ?? undefined,
    targetDistance: row.targetDistance ?? undefined,
    eligibleCandles: row.eligibleCandles ?? undefined,
    createdCandleTime: row.createdCandleTime,
    expiresCandleTime: row.expiresCandleTime ?? undefined,
    lastEventCandleTime: row.lastEventCandleTime,
  };
}

export function toFillInput(row: typeof fills.$inferSelect): FillInput {
  return {
    orderKey: row.orderKey,
    positionKey: row.positionKey,
    candleTime: row.candleTime,
    side: row.side as OrderSide,
    price: row.price,
    quantity: row.quantity,
    notional: row.notional,
    fee: row.fee,
  };
}

export function toPositionInput(row: typeof positions.$inferSelect): PositionInput {
  return {
    engineKey: row.engineKey,
    status: row.status as PositionStatus,
    entryPrice: row.entryPrice,
    quantity: row.quantity,
    stopPrice: row.stopPrice,
    targetPrice: row.targetPrice,
    entryFee: row.entryFee,
    exitPrice: row.exitPrice ?? undefined,
    exitFee: row.exitFee ?? undefined,
    netProfit: row.netProfit ?? undefined,
    exitReason: (row.exitReason ?? undefined) as ExitReason | undefined,
    openedCandleTime: row.openedCandleTime,
    closedCandleTime: row.closedCandleTime ?? undefined,
  };
}
