// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { COIN_FLIP_VERDICT } from '@ativada/statistics';

import { decimalTextSchema, epochMillisecondsSchema } from '../../openapi/schema-primitives.js';
import { PAGE_QUERY_SHAPE } from '../../shared/pagination/page-query.schema.js';
import {
  PROJECTION_RESULT,
  PROJECTION_RULE_VERSION,
  PROJECTION_SIDE,
  PROJECTION_STANCE,
  PROJECTION_STRENGTH,
  PROJECTION_UNAVAILABLE_REASON,
} from './projections.constant.js';

export const projectionsQuerySchema = z.strictObject(PAGE_QUERY_SHAPE);

const nullableDecimal = decimalTextSchema.nullable();
const count = z.number().int().nonnegative();

const ITEM_SCHEMA = z.strictObject({
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  side: z.enum(Object.values(PROJECTION_SIDE)),
  strength: z.enum(Object.values(PROJECTION_STRENGTH)).nullable(),
  score: decimalTextSchema,
  base: decimalTextSchema,
  bandLow: nullableDecimal,
  bandHigh: nullableDecimal,
  nextClose: nullableDecimal,
  moveRate: nullableDecimal,
  result: z.enum(Object.values(PROJECTION_RESULT)),
  isInside: z.boolean().nullable(),
});

const CURRENT_SCHEMA = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    candleTime: epochMillisecondsSchema,
    closedAt: epochMillisecondsSchema,
    horizonEndsAt: epochMillisecondsSchema,
    side: z.enum([PROJECTION_SIDE.BUY, PROJECTION_SIDE.SELL]),
    stance: z.enum(Object.values(PROJECTION_STANCE)),
    strength: z.enum(Object.values(PROJECTION_STRENGTH)),
    score: decimalTextSchema,
    threshold: decimalTextSchema,
    base: decimalTextSchema,
    bandLow: nullableDecimal,
    bandHigh: nullableDecimal,
    atr: nullableDecimal,
    label: z.string(),
    message: z.string(),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    reason: z.enum(Object.values(PROJECTION_UNAVAILABLE_REASON)),
    message: z.string(),
  }),
]);

const SUMMARY_SCHEMA = z.strictObject({
  counted: count,
  hits: count,
  misses: count,
  ties: count,
  noSide: count,
  pending: count,
  upMoves: count,
  banded: count,
  inside: count,
  hitRate: nullableDecimal,
  upRate: nullableDecimal,
  insideRate: nullableDecimal,
  byStrength: z.array(
    z.strictObject({
      strength: z.enum(Object.values(PROJECTION_STRENGTH)),
      counted: count,
      hits: count,
      hitRate: nullableDecimal,
    }),
  ),
  wilson: z.strictObject({ lower: decimalTextSchema, upper: decimalTextSchema }).nullable(),
  verdict: z.enum(Object.values(COIN_FLIP_VERDICT)),
  message: z.string(),
  verdictMessage: z.string(),
});

export const PROJECTIONS_SCHEMA = z.strictObject({
  version: z.literal(PROJECTION_RULE_VERSION),
  timeframe: z.string(),
  current: CURRENT_SCHEMA.optional(),
  summary: SUMMARY_SCHEMA.optional(),
  items: z.array(ITEM_SCHEMA),
  nextCursor: z.string().nullable(),
});
