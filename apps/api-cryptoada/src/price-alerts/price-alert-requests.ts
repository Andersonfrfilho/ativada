// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { EngineDecimal, formatEngineDecimal } from '@cryptoada/strategy-engine';
import {
  PRICE_ALERT_DIRECTION,
  PRICE_ALERT_ORIGIN,
  type PriceAlertDirection,
  type PriceAlertOrigin,
} from '@cryptoada/database';

import { NO_FIELD_REASON, PRICE_ALERT_REASON } from './price-alert.constant.js';

const TEXT_MAXIMUM = 64;
const VALUE_PATTERN = /^\d{1,10}(\.\d{1,8})?$/;
const MAXIMUM_VALUE = new EngineDecimal('1000000000');
const DIRECTIONS = [PRICE_ALERT_DIRECTION.ABOVE, PRICE_ALERT_DIRECTION.BELOW] as const;
const ORIGINS = [PRICE_ALERT_ORIGIN.MANUAL, PRICE_ALERT_ORIGIN.PLAN] as const;

export type CreatePriceAlertBody = {
  readonly symbol: string;
  readonly direction: PriceAlertDirection;
  readonly value: string;
  readonly origin: PriceAlertOrigin;
};

export type PatchPriceAlertBody = {
  readonly direction?: PriceAlertDirection | undefined;
  readonly value?: string | undefined;
  readonly isEnabled?: boolean | undefined;
};

function isPositiveValue(text: string): boolean {
  if (!VALUE_PATTERN.test(text)) return false;
  const value = new EngineDecimal(text);
  return value.greaterThan(0) && value.lte(MAXIMUM_VALUE);
}

// Valor positivo, até 8 casas, em texto: nunca `number`. A grafia sai canônica ("70000.50" = "70000.5").
const valueSchema = z
  .string()
  .max(TEXT_MAXIMUM)
  .refine(isPositiveValue, { error: PRICE_ALERT_REASON.INVALID_VALUE })
  .transform((text) => formatEngineDecimal(new EngineDecimal(text)));

function enabledSymbol(enabledSymbols: readonly string[]): z.ZodType<string> {
  return z
    .string()
    .max(TEXT_MAXIMUM)
    .refine((symbol) => enabledSymbols.includes(symbol), { error: PRICE_ALERT_REASON.NOT_ENABLED });
}

export function createPriceAlertSchema(
  enabledSymbols: readonly string[],
): z.ZodType<CreatePriceAlertBody> {
  return z.strictObject({
    symbol: enabledSymbol(enabledSymbols),
    direction: z.enum(DIRECTIONS),
    value: valueSchema,
    origin: z.enum(ORIGINS).default(PRICE_ALERT_ORIGIN.MANUAL),
  });
}

export const patchPriceAlertSchema: z.ZodType<PatchPriceAlertBody> = z
  .strictObject({
    direction: z.enum(DIRECTIONS).optional(),
    value: valueSchema.optional(),
    isEnabled: z.boolean().optional(),
  })
  .superRefine((body, context) => {
    if (Object.values(body).every((field) => field === undefined)) {
      context.addIssue({ code: 'custom', path: [], message: NO_FIELD_REASON });
    }
  });
