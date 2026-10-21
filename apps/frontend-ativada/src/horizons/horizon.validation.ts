// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { decimalText, nullableDecimalText } from '../http/decimal.validation.js';
import { HORIZON_ROW_KIND, INTRADAY_VERDICT } from './horizon.constant.js';

const strategyRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  versionId: z.string(),
  version: z.number(),
});

const intradayRowSchema = z.object({
  kind: z.literal(HORIZON_ROW_KIND.INTRADAY),
  days: z.number(),
  strategy: strategyRefSchema,
  netReturn: nullableDecimalText,
  tradeCount: z.number(),
  feesPaid: decimalText,
  feeShareOfGross: nullableDecimalText,
  verdict: z.enum([INTRADAY_VERDICT.WORTH, INTRADAY_VERDICT.NOT_WORTH]),
  message: z.string(),
});

const dailyRowSchema = z.object({
  kind: z.literal(HORIZON_ROW_KIND.DAILY),
  horizonDays: z.number(),
  strategy: strategyRefSchema,
  windowCount: z.number(),
  positiveCount: z.number(),
  median: nullableDecimalText,
  positiveRate: nullableDecimalText,
  worstDecile: nullableDecimalText,
  isShortHistory: z.boolean(),
  benchmark: z.object({
    median: nullableDecimalText,
    positiveRate: nullableDecimalText,
    worstDecile: nullableDecimalText,
  }),
  isRecommended: z.boolean(),
  message: z.string(),
});

export const horizonsSchema = z.object({
  symbol: z.string(),
  evaluatedStrategies: z.number(),
  isStrategyListTruncated: z.boolean(),
  rows: z.array(z.discriminatedUnion('kind', [intradayRowSchema, dailyRowSchema])),
  recommendedHorizonDays: z.number().nullable(),
  recommendationMessage: z.string(),
  unavailable: z.array(z.object({ strategyId: z.string(), reason: z.string() })),
});

export type Horizons = z.infer<typeof horizonsSchema>;
export type HorizonRowData = Horizons['rows'][number];
export type IntradayRowData = Extract<HorizonRowData, { kind: 'intraday' }>;
export type DailyRowData = Extract<HorizonRowData, { kind: 'daily' }>;
