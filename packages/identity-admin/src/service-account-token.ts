// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import { HTTP_STATUS } from './identity-http.constant.js';
import {
  CLIENT_CREDENTIALS_GRANT,
  IDENTITY_REQUEST_TIMEOUT_MILLISECONDS,
  MILLISECONDS_PER_SECOND,
  TOKEN_EXPIRY_MARGIN_SECONDS,
} from './identity-admin.constant.js';

export type ServiceAccountTokenSettings = {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now: () => number;
};

export type ServiceAccountTokenProvider = {
  readonly getToken: () => Promise<string | undefined>;
  readonly discardToken: () => void;
};

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

type CachedToken = { readonly value: string; readonly expiresAtMilliseconds: number };

async function requestToken(
  settings: ServiceAccountTokenSettings,
): Promise<CachedToken | undefined> {
  try {
    const response = await fetch(settings.tokenUrl, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: CLIENT_CREDENTIALS_GRANT,
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
      }),
      signal: AbortSignal.timeout(IDENTITY_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (response.status !== HTTP_STATUS.OK) return undefined;
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) return undefined;
    const lifetimeSeconds = parsed.data.expires_in - TOKEN_EXPIRY_MARGIN_SECONDS;
    return {
      value: parsed.data.access_token,
      expiresAtMilliseconds: settings.now() + lifetimeSeconds * MILLISECONDS_PER_SECOND,
    };
  } catch {
    return undefined;
  }
}

export function createServiceAccountTokenProvider(
  settings: ServiceAccountTokenSettings,
): ServiceAccountTokenProvider {
  let cached: CachedToken | undefined;
  return {
    getToken: async (): Promise<string | undefined> => {
      if (cached !== undefined && cached.expiresAtMilliseconds > settings.now())
        return cached.value;
      cached = await requestToken(settings);
      return cached?.value;
    },
    discardToken: (): void => {
      cached = undefined;
    },
  };
}
