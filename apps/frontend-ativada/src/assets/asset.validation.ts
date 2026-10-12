// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { decimalText, nullableDecimalText } from '../http/decimal.validation.js';

const assetItemSchema = z.object({
  symbol: z.string(),
  quantity: decimalText,
  averagePrice: decimalText,
  price: z.object({ value: decimalText }).nullable(),
  value: nullableDecimalText,
  cost: decimalText,
  result: nullableDecimalText,
  resultRate: nullableDecimalText,
  targetPrice: decimalText,
  stopPrice: decimalText,
  isTargetReached: z.boolean().nullable(),
  isStopReached: z.boolean().nullable(),
  rule: z
    .object({
      action: z.enum(['hold', 'sell', 'wait']),
      situation: z.object({ signal: z.object({ reason: z.string() }) }),
    })
    .nullable(),
});

export const assetSummarySchema = z.object({
  currency: z.string(),
  targetRate: decimalText,
  stopRate: decimalText,
  strategy: z.object({ id: z.string(), name: z.string(), version: z.number() }).nullable(),
  items: z.array(assetItemSchema),
  totals: z.object({
    value: decimalText,
    cost: decimalText,
    result: decimalText,
    resultRate: nullableDecimalText,
    pricedAssets: z.number(),
    unpricedAssets: z.number(),
  }),
});

export const savedAssetSchema = z.object({ symbol: z.string() });

export type AssetItem = z.infer<typeof assetItemSchema>;
export type AssetSummary = z.infer<typeof assetSummarySchema>;
