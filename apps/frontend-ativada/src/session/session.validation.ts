// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { dataEnvelopeSchema } from '../http/envelope.validation.js';

export const tokenResponseSchema = dataEnvelopeSchema(
  z.object({ accessToken: z.string().min(1), expiresIn: z.number().positive() }),
);

const accessTokenClaimsSchema = z.object({ email: z.string().optional() });

function decodeBase64Url(segment: string): string {
  const binary = atob(segment.replaceAll('-', '+').replaceAll('_', '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0));
}

// Só leitura de exibição do próprio token em memória; quem valida a assinatura é a API.
export function readEmailClaim(accessToken: string): string | undefined {
  const payload = accessToken.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    const parsed = accessTokenClaimsSchema.safeParse(JSON.parse(decodeBase64Url(payload)));
    return parsed.success ? parsed.data.email : undefined;
  } catch {
    return undefined;
  }
}
