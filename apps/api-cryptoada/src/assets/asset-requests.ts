// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { EngineDecimal, GoalInputError, parseGoalSpec } from '@cryptoada/strategy-engine';

import { ASSET_REASON, ASSET_SIDE, type AssetSide } from './asset.constant.js';

const TEXT_MAXIMUM = 64;
const DECIMAL_PATTERN = /^\d{1,14}(\.\d{1,8})?$/;
const MAXIMUM_VALUE = new EngineDecimal('100000000000000');
const RATE_PROBE = { targetRate: '0.01', maxLossRate: '0.01', horizonDays: 1 } as const;

export type ReplaceAssetBody = { readonly quantity: string; readonly averagePrice: string };
export type TradeAssetBody =
  | { readonly side: typeof ASSET_SIDE.BUY; readonly quantity: string; readonly price: string }
  | { readonly side: typeof ASSET_SIDE.SELL; readonly quantity: string };
export type AssetSummaryQuery = {
  readonly strategyId?: string | undefined;
  readonly targetRate?: string | undefined;
  readonly stopRate?: string | undefined;
};

function isPositive(text: string): boolean {
  if (!DECIMAL_PATTERN.test(text)) return false;
  const value = new EngineDecimal(text);
  return value.greaterThan(0) && value.lte(MAXIMUM_VALUE);
}

// Decimal positivo em texto, até 8 casas (nunca `number`); a grafia canônica sai da conta da posição; o erro nunca repete o valor.
const positiveDecimal = z
  .string()
  .max(TEXT_MAXIMUM)
  .refine(isPositive, { error: ASSET_REASON.INVALID_VALUE });

export const replaceAssetSchema: z.ZodType<ReplaceAssetBody> = z.strictObject({
  quantity: positiveDecimal,
  averagePrice: positiveDecimal,
});

export const tradeAssetSchema: z.ZodType<TradeAssetBody> = z.discriminatedUnion('side', [
  z.strictObject({
    side: z.literal(ASSET_SIDE.BUY),
    quantity: positiveDecimal,
    price: positiveDecimal,
  }),
  z.strictObject({ side: z.literal(ASSET_SIDE.SELL), quantity: positiveDecimal }),
]);

function isValidRate(field: 'targetRate' | 'maxLossRate', value: string): boolean {
  try {
    parseGoalSpec({ ...RATE_PROBE, [field]: value });
    return true;
  } catch (error: unknown) {
    if (error instanceof GoalInputError) return false;
    throw error;
  }
}

// Alvo e stop passam pelo MESMO esquema da meta do motor (alvo de 0 a 1000%, perda de 0 a 100%, exclusivos).
export const assetSummaryQuerySchema: z.ZodType<AssetSummaryQuery> = z.strictObject({
  strategyId: z.uuid().optional(),
  targetRate: z
    .string()
    .max(TEXT_MAXIMUM)
    .refine((value) => isValidRate('targetRate', value), { error: ASSET_REASON.INVALID_VALUE })
    .optional(),
  stopRate: z
    .string()
    .max(TEXT_MAXIMUM)
    .refine((value) => isValidRate('maxLossRate', value), { error: ASSET_REASON.INVALID_VALUE })
    .optional(),
});

export type { AssetSide };
