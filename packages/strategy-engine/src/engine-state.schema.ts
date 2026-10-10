// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { DECIMAL_STATE_TEXT_SCHEMA } from './decimal-text.schema.js';
import { CUSTOM_ISSUE_CODE, ENGINE_STATE_VERSION } from './engine.constant.js';
import {
  ENTRY_ORDER_TYPE,
  EXIT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
} from './engine-vocabulary.constant.js';

const PENDING_ORDER_PATH = ['pendingOrder'];
const TIME_SCHEMA = z.number().int().nonnegative();
const COUNT_SCHEMA = z.number().int().nonnegative();
const KEY_SCHEMA = z.string().min(1).max(64);

const OPEN_POSITION_SCHEMA = z.strictObject({
  positionKey: KEY_SCHEMA,
  openedCandleOpenTime: TIME_SCHEMA,
  entryPrice: DECIMAL_STATE_TEXT_SCHEMA,
  quantity: DECIMAL_STATE_TEXT_SCHEMA,
  stopPrice: DECIMAL_STATE_TEXT_SCHEMA,
  targetPrice: DECIMAL_STATE_TEXT_SCHEMA,
  entryFee: DECIMAL_STATE_TEXT_SCHEMA,
});

const PENDING_ORDER_SCHEMA = z.strictObject({
  orderKey: KEY_SCHEMA,
  side: z.enum(ORDER_SIDE),
  type: z.enum(ENTRY_ORDER_TYPE),
  purpose: z.enum(ORDER_PURPOSE),
  createdCandleOpenTime: TIME_SCHEMA,
  limitPrice: DECIMAL_STATE_TEXT_SCHEMA.nullable(),
  quoteBudget: DECIMAL_STATE_TEXT_SCHEMA.nullable(),
  stopDistance: DECIMAL_STATE_TEXT_SCHEMA.nullable(),
  targetDistance: DECIMAL_STATE_TEXT_SCHEMA.nullable(),
  eligibleCandles: COUNT_SCHEMA.nullable(),
  exitReason: z.enum(EXIT_REASON).nullable(),
});

const BENCHMARK_SCHEMA = z.strictObject({
  quantity: DECIMAL_STATE_TEXT_SCHEMA,
  cash: DECIMAL_STATE_TEXT_SCHEMA,
});

export const ENGINE_STATE_SCHEMA = z
  .strictObject({
    version: z.literal(ENGINE_STATE_VERSION),
    engineVersion: KEY_SCHEMA,
    configHash: z.string().regex(/^[0-9a-f]{64}$/),
    leadInCandles: z.number().int().positive(),
    processedCandles: COUNT_SCHEMA,
    lastCandleOpenTime: TIME_SCHEMA.nullable(),
    sequence: COUNT_SCHEMA,
    isHalted: z.boolean(),
    cash: DECIMAL_STATE_TEXT_SCHEMA,
    position: OPEN_POSITION_SCHEMA.nullable(),
    pendingOrder: PENDING_ORDER_SCHEMA.nullable(),
    benchmark: BENCHMARK_SCHEMA.nullable(),
    indicators: z.record(z.string(), z.json()),
  })
  .superRefine((state, context) => {
    if ((state.processedCandles === 0) !== (state.lastCandleOpenTime === null)) {
      context.addIssue({
        code: CUSTOM_ISSUE_CODE,
        message: 'lastCandleOpenTime é nulo se, e só se, nenhum candle foi processado.',
        path: ['lastCandleOpenTime'],
      });
    }
    const pendingSide = state.pendingOrder?.side;
    if (pendingSide === ORDER_SIDE.BUY && state.position !== null) {
      context.addIssue({
        code: CUSTOM_ISSUE_CODE,
        message: 'Entrada pendente com posição aberta.',
        path: PENDING_ORDER_PATH,
      });
    }
    if (pendingSide === ORDER_SIDE.SELL && state.position === null) {
      context.addIssue({
        code: CUSTOM_ISSUE_CODE,
        message: 'Saída pendente sem posição.',
        path: PENDING_ORDER_PATH,
      });
    }
  });
