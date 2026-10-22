// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PRODUCTION_ENVIRONMENT, z } from '@ativada/environment';

const PROXY_HOPS_EXPECTATION = 'inteiro entre 0 e 10';
const MAX_TRUSTED_PROXY_HOPS = 10;
export const DEFAULT_TRUSTED_PROXY_HOPS = 0;
const PRODUCTION_PROXY_HOPS_REASON =
  'obrigatória em produção (use 1 ou mais atrás de proxy; 0 só com a API exposta direto)';

export const trustedProxyHopsSchema = z.coerce
  .number({ error: PROXY_HOPS_EXPECTATION })
  .int({ error: PROXY_HOPS_EXPECTATION })
  .min(0, { error: PROXY_HOPS_EXPECTATION })
  .max(MAX_TRUSTED_PROXY_HOPS, { error: PROXY_HOPS_EXPECTATION })
  .optional();

export function checkProxyHops(
  values: { readonly ENV: string; readonly TRUSTED_PROXY_HOPS?: number | undefined },
  context: z.RefinementCtx,
): void {
  if (values.ENV !== PRODUCTION_ENVIRONMENT || values.TRUSTED_PROXY_HOPS !== undefined) return;
  context.addIssue({
    code: 'custom',
    message: PRODUCTION_PROXY_HOPS_REASON,
    path: ['TRUSTED_PROXY_HOPS'],
  });
}
