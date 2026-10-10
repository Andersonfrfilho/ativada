// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import {
  NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
  POSITIVE_DECIMAL_STATE_TEXT_SCHEMA,
} from './decimal-text.schema.js';
import { CUSTOM_ISSUE_CODE } from './engine.constant.js';
import { toEngineDecimal } from './engine-decimal.js';
import {
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
} from './engine-vocabulary.constant.js';
import type { OpenPositionState, PendingOrderState } from './engine-state.types.js';

export const TIME_SCHEMA = z.number().int().nonnegative();
export const COUNT_SCHEMA = z.number().int().nonnegative();
const KEY_SCHEMA = z.string().min(1).max(64);
const PENDING_ORDER_PATH = ['pendingOrder'];

export type IssueSink = z.RefinementCtx;

export function reportIssue(
  context: IssueSink,
  path: readonly (string | number)[],
  message: string,
): void {
  context.addIssue({ code: CUSTOM_ISSUE_CODE, message, path: [...path] });
}

const OPEN_POSITION_SCHEMA = z
  .strictObject({
    positionKey: KEY_SCHEMA,
    openedCandleOpenTime: TIME_SCHEMA,
    entryPrice: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA,
    quantity: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA,
    stopPrice: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA,
    targetPrice: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA,
    entryFee: NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
  })
  .superRefine((position: OpenPositionState, context) => {
    const entry = toEngineDecimal(position.entryPrice);
    const isOrdered =
      toEngineDecimal(position.stopPrice).lessThan(entry) &&
      entry.lessThan(toEngineDecimal(position.targetPrice));
    if (!isOrdered) reportIssue(context, ['stopPrice'], 'Exige stop < entrada < alvo.');
  });

function checkEntryOrder(order: PendingOrderState, context: IssueSink): void {
  const hasSizing =
    order.riskAmount !== null && order.stopDistance !== null && order.targetDistance !== null;
  if (!hasSizing || order.exitReason !== null) {
    reportIssue(context, ['riskAmount'], 'Entrada exige risco e distâncias, sem motivo de saída.');
  }
  const isLimit = order.type === ENTRY_ORDER_TYPE.LIMIT;
  const hasLimitFields = order.limitPrice !== null && order.eligibleCandles !== null;
  const hasNoLimitFields = order.limitPrice === null && order.eligibleCandles === null;
  if (isLimit ? !hasLimitFields : !hasNoLimitFields) {
    reportIssue(
      context,
      ['limitPrice'],
      'Limitada exige preço e validade; mercado, nenhum dos dois.',
    );
  }
}

function checkExitOrder(order: PendingOrderState, context: IssueSink): void {
  const hasEntryFields =
    order.riskAmount !== null || order.stopDistance !== null || order.limitPrice !== null;
  if (order.exitReason === null || hasEntryFields || order.type !== ENTRY_ORDER_TYPE.MARKET) {
    reportIssue(context, ['exitReason'], 'Saída é a mercado, com motivo e sem campos de entrada.');
  }
}

const PENDING_ORDER_SCHEMA = z
  .strictObject({
    orderKey: KEY_SCHEMA,
    side: z.enum(ORDER_SIDE),
    type: z.enum(ENTRY_ORDER_TYPE),
    purpose: z.enum(ORDER_PURPOSE),
    createdCandleOpenTime: TIME_SCHEMA,
    limitPrice: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA.nullable(),
    riskAmount: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA.nullable(),
    stopDistance: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA.nullable(),
    targetDistance: POSITIVE_DECIMAL_STATE_TEXT_SCHEMA.nullable(),
    eligibleCandles: z.number().int().positive().nullable(),
    filledQuantity: NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
    exitReason: z.enum(EXIT_REASON).nullable(),
  })
  .superRefine((order: PendingOrderState, context) => {
    const isEntry = order.purpose === ORDER_PURPOSE.ENTRY;
    if (isEntry !== (order.side === ORDER_SIDE.BUY)) {
      reportIssue(context, ['side'], 'Entrada compra; saída vende.');
    }
    if (isEntry) checkEntryOrder(order, context);
    else checkExitOrder(order, context);
  });

const BENCHMARK_SCHEMA = z.strictObject({
  quantity: NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
  cash: NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
});

const WALLET_STATE_SHAPE = z.strictObject({
  keyPrefix: z.string().regex(/^([a-z0-9-]{1,16}:)?$/),
  lastCandleOpenTime: TIME_SCHEMA.nullable(),
  firstSignalCandleOpenTime: TIME_SCHEMA.nullable(),
  sequence: COUNT_SCHEMA,
  isHalted: z.boolean(),
  cash: NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA,
  position: OPEN_POSITION_SCHEMA.nullable(),
  pendingOrder: PENDING_ORDER_SCHEMA.nullable(),
  benchmark: BENCHMARK_SCHEMA.nullable(),
});

type WalletShape = z.output<typeof WALLET_STATE_SHAPE>;

function checkTradingStart(wallet: WalletShape, context: IssueSink): void {
  const last = wallet.lastCandleOpenTime ?? -1;
  const first = wallet.firstSignalCandleOpenTime;
  if (first !== null && first > last) {
    reportIssue(context, ['firstSignalCandleOpenTime'], 'Primeiro sinal depois do último candle.');
  }
  if (wallet.benchmark !== null && (first === null || first >= last)) {
    reportIssue(context, ['benchmark'], 'Régua só compra na abertura seguinte ao primeiro sinal.');
  }
}

export const WALLET_STATE_SCHEMA = WALLET_STATE_SHAPE.superRefine((wallet, context) => {
  const pendingSide = wallet.pendingOrder?.side;
  if (pendingSide === ORDER_SIDE.BUY && wallet.position !== null) {
    reportIssue(context, PENDING_ORDER_PATH, 'Entrada pendente com posição aberta.');
  }
  if (pendingSide === ORDER_SIDE.SELL && wallet.position === null) {
    reportIssue(context, PENDING_ORDER_PATH, 'Saída pendente sem posição.');
  }
  checkTradingStart(wallet, context);
});
