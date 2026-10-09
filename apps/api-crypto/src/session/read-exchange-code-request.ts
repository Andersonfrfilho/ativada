// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import {
  CODE_MAX_LENGTH,
  CODE_VERIFIER_MAX_LENGTH,
  CODE_VERIFIER_MIN_LENGTH,
  CODE_VERIFIER_PATTERN,
  REDIRECT_URI_MAX_LENGTH,
} from './session.constant.js';
import { InvalidSessionRequestError } from './session.error.js';
import type { ExchangeCodeParams } from './keycloak-token-client.js';

const exchangeCodeBodySchema = z.strictObject({
  code: z.string().min(1).max(CODE_MAX_LENGTH),
  codeVerifier: z
    .string()
    .min(CODE_VERIFIER_MIN_LENGTH)
    .max(CODE_VERIFIER_MAX_LENGTH)
    .regex(CODE_VERIFIER_PATTERN),
  redirectUri: z.string().min(1).max(REDIRECT_URI_MAX_LENGTH),
});

export async function readExchangeCodeRequest(request: Request): Promise<ExchangeCodeParams> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = exchangeCodeBodySchema.safeParse(body);
  if (!parsed.success) throw new InvalidSessionRequestError();
  return parsed.data;
}
