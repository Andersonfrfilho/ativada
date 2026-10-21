// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

const MULTIPLIER_EXPECTATION = 'inteiro entre 1 e 20 (acima de 1 só com ENV=dev)';
const MAX_MULTIPLIER = 20;
const DEFAULT_MULTIPLIER = 1;
const DEV_ENVIRONMENT = 'dev';

// Vários agentes e abas dividem o mesmo usuário no ambiente de desenvolvimento: o teto de cada política pode ser multiplicado ali.
export const rateLimitEnvironmentShape = {
  RATE_LIMIT_MULTIPLIER: z.coerce
    .number({ error: MULTIPLIER_EXPECTATION })
    .int({ error: MULTIPLIER_EXPECTATION })
    .min(1, { error: MULTIPLIER_EXPECTATION })
    .max(MAX_MULTIPLIER, { error: MULTIPLIER_EXPECTATION })
    .default(DEFAULT_MULTIPLIER),
} as const;

const OUTSIDE_DEV_EXPECTATION = 'só pode passar de 1 com ENV=dev';

export function checkRateLimit(
  values: { readonly ENV: string; readonly RATE_LIMIT_MULTIPLIER: number },
  context: z.RefinementCtx,
): void {
  if (values.ENV === DEV_ENVIRONMENT || values.RATE_LIMIT_MULTIPLIER === DEFAULT_MULTIPLIER) return;
  context.addIssue({
    code: 'custom',
    message: OUTSIDE_DEV_EXPECTATION,
    path: ['RATE_LIMIT_MULTIPLIER'],
  });
}
