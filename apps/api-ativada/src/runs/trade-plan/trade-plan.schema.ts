// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { SIZING_CONSTRAINT } from '@ativada/strategy-engine';

import {
  decimalTextSchema,
  epochMillisecondsSchema,
  resourceIdSchema,
} from '../../openapi/schema-primitives.js';
import {
  TEAM_PLAN_STATUS,
  TEAM_PLAN_UNAVAILABLE_REASON,
  TRADE_PLAN_STATUS,
  TRADE_PLAN_UNAVAILABLE_REASON,
} from './trade-plan.constant.js';

const DISTANCE = z.strictObject({ value: decimalTextSchema, rate: decimalTextSchema });
const RESULT = z.strictObject({ net: decimalTextSchema, rate: decimalTextSchema });
const PRICE_POINT = { price: decimalTextSchema, distance: DISTANCE };

const PROTECTIVE = z.strictObject({
  ...PRICE_POINT,
  exitPrice: decimalTextSchema,
  fromEntryRate: decimalTextSchema,
  result: RESULT.nullable(),
});

const SIZING = z.strictObject({
  riskAmount: decimalTextSchema,
  quantity: decimalTextSchema,
  notional: decimalTextSchema,
  entryCost: decimalTextSchema,
  constraint: z.enum(Object.values(SIZING_CONSTRAINT)),
});

const DECIDED_CANDLE = {
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  currentPrice: decimalTextSchema,
};

const PLAN_SCHEMA = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(TRADE_PLAN_STATUS.AWAITING_ENTRY),
    ...DECIDED_CANDLE,
    orderType: z.enum(['market', 'limit']),
    nextOpenEstimate: decimalTextSchema.nullable(),
    entry: z.strictObject(PRICE_POINT),
    target: PROTECTIVE,
    stop: PROTECTIVE,
    sizing: SIZING,
    message: z.string(),
  }),
  z.strictObject({
    status: z.literal(TRADE_PLAN_STATUS.HOLDING),
    ...DECIDED_CANDLE,
    entryPrice: decimalTextSchema,
    quantity: decimalTextSchema,
    entryCost: decimalTextSchema,
    openedCandleTime: epochMillisecondsSchema,
    exit: z.strictObject({ ...PRICE_POINT, result: RESULT }),
    target: PROTECTIVE,
    stop: PROTECTIVE,
    message: z.string(),
  }),
  z.strictObject({
    status: z.literal(TRADE_PLAN_STATUS.UNAVAILABLE),
    reason: z.enum(Object.values(TRADE_PLAN_UNAVAILABLE_REASON)),
    message: z.string(),
  }),
]);

const TEAM_HEAD = {
  teamKey: z.string(),
  displayName: z.string(),
  wallet: z
    .strictObject({
      current: decimalTextSchema,
      result: decimalTextSchema,
      resultRate: decimalTextSchema,
    })
    .nullable(),
};

const TEAM_SCHEMA = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(TEAM_PLAN_STATUS.AVAILABLE),
    ...TEAM_HEAD,
    reportId: resourceIdSchema,
    candleTime: epochMillisecondsSchema,
    confidence: z.number().int().nullable(),
    entry: z.strictObject({ ...PRICE_POINT, suggestedPrice: decimalTextSchema }),
    target: PROTECTIVE,
    stop: PROTECTIVE,
    sizing: SIZING,
    message: z.string(),
  }),
  z.strictObject({
    status: z.literal(TEAM_PLAN_STATUS.UNAVAILABLE),
    ...TEAM_HEAD,
    reason: z.enum(Object.values(TEAM_PLAN_UNAVAILABLE_REASON)),
    reportId: resourceIdSchema.nullable(),
    candleTime: epochMillisecondsSchema.nullable(),
    action: z.enum(['buy', 'sell', 'hold']).nullable(),
    confidence: z.number().int().nullable(),
    message: z.string(),
  }),
]);

export const TRADE_PLAN_SCHEMA = z.strictObject({
  version: z.string(),
  runId: resourceIdSchema,
  symbol: z.string(),
  timeframe: z.string(),
  notice: z.string(),
  plan: PLAN_SCHEMA,
  teams: z.array(TEAM_SCHEMA),
});
