// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalTextSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import { HORIZON_INTRADAY_TIMEFRAME } from './horizon.constant.js';
import { HORIZON_ROW_KIND } from './horizon-view.js';

const NULLABLE_RATE = decimalTextSchema.nullable();

const STRATEGY_REF_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  name: z.string(),
  versionId: resourceIdSchema,
  version: z.number().int().positive(),
});

const DISTRIBUTION_SCHEMA = z.strictObject({
  median: NULLABLE_RATE,
  positiveRate: NULLABLE_RATE,
  worstDecile: NULLABLE_RATE,
});

const INTRADAY_ROW_SCHEMA = z.strictObject({
  kind: z.literal(HORIZON_ROW_KIND.INTRADAY),
  timeframe: z.literal(HORIZON_INTRADAY_TIMEFRAME),
  days: z.number().int().positive(),
  strategy: STRATEGY_REF_SCHEMA,
  netReturn: NULLABLE_RATE,
  tradeCount: z.number().int().nonnegative(),
  feesPaid: decimalTextSchema,
  feeShareOfGross: NULLABLE_RATE,
  verdict: z.enum(['COMPENSA', 'NAO_COMPENSA']),
  message: z.string(),
});

const DAILY_ROW_SCHEMA = z.strictObject({
  kind: z.literal(HORIZON_ROW_KIND.DAILY),
  horizonDays: z.number().int().positive(),
  strategy: STRATEGY_REF_SCHEMA,
  windowCount: z.number().int().nonnegative(),
  positiveCount: z.number().int().nonnegative(),
  median: NULLABLE_RATE,
  positiveRate: NULLABLE_RATE,
  worstDecile: NULLABLE_RATE,
  isShortHistory: z.boolean(),
  benchmark: DISTRIBUTION_SCHEMA,
  isRecommended: z.boolean(),
  message: z.string(),
});

export const HORIZONS_VIEW_SCHEMA = z.strictObject({
  symbol: z.string(),
  evaluatedStrategies: z.number().int().nonnegative(),
  isStrategyListTruncated: z.boolean(),
  rows: z.array(z.discriminatedUnion('kind', [INTRADAY_ROW_SCHEMA, DAILY_ROW_SCHEMA])),
  recommendedHorizonDays: z.number().int().positive().nullable(),
  recommendationMessage: z.string(),
  unavailable: z.array(z.strictObject({ strategyId: resourceIdSchema, reason: z.string() })),
});
