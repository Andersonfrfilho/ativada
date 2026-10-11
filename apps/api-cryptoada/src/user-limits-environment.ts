// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const ALERTS_EXPECTATION = 'inteiro entre 1 e 500';
const ASSETS_EXPECTATION = 'inteiro entre 1 e 200';
const MAX_ENABLED_PRICE_ALERTS = 500;
const DEFAULT_ENABLED_PRICE_ALERTS = 50;
const MAX_USER_ASSETS = 200;
const DEFAULT_USER_ASSETS = 50;

function boundedInteger(params: {
  readonly expectation: string;
  readonly maximum: number;
  readonly fallback: number;
}): z.ZodDefault<z.ZodCoercedNumber> {
  return z.coerce
    .number({ error: params.expectation })
    .int({ error: params.expectation })
    .min(1, { error: params.expectation })
    .max(params.maximum, { error: params.expectation })
    .default(params.fallback);
}

// Tetos de uso por usuário (RF00b) dos alertas de preço ligados (RF14) e dos ativos cadastrados (RF15).
export const userLimitsEnvironmentShape = {
  PRICE_ALERT_MAX_ENABLED_PER_USER: boundedInteger({
    expectation: ALERTS_EXPECTATION,
    maximum: MAX_ENABLED_PRICE_ALERTS,
    fallback: DEFAULT_ENABLED_PRICE_ALERTS,
  }),
  USER_ASSET_MAX_PER_USER: boundedInteger({
    expectation: ASSETS_EXPECTATION,
    maximum: MAX_USER_ASSETS,
    fallback: DEFAULT_USER_ASSETS,
  }),
} as const;
