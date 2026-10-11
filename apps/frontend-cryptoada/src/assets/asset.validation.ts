// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const assetItemSchema = z.object({
  symbol: z.string(),
  quantity: z.string(),
  averagePrice: z.string(),
  price: z.object({ value: z.string() }).nullable(),
  value: z.string().nullable(),
  cost: z.string(),
  result: z.string().nullable(),
  resultRate: z.string().nullable(),
  targetPrice: z.string(),
  stopPrice: z.string(),
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
  targetRate: z.string(),
  stopRate: z.string(),
  strategy: z.object({ id: z.string(), name: z.string(), version: z.number() }).nullable(),
  items: z.array(assetItemSchema),
  totals: z.object({
    value: z.string(),
    cost: z.string(),
    result: z.string(),
    resultRate: z.string().nullable(),
    pricedAssets: z.number(),
    unpricedAssets: z.number(),
  }),
});

export const savedAssetSchema = z.object({ symbol: z.string() });

export type AssetItem = z.infer<typeof assetItemSchema>;
export type AssetSummary = z.infer<typeof assetSummarySchema>;
