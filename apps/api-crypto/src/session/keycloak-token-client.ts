// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import {
  KEYCLOAK_REQUEST_TIMEOUT_MILLISECONDS,
  OAUTH_FIELD,
  OAUTH_GRANT_TYPE,
  REVOCATION_STATUS,
  TOKEN_GRANT_STATUS,
} from './session.constant.js';

export type SessionTokens = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly refreshExpiresInSeconds: number;
};

export type TokenGrantResult =
  | { readonly status: typeof TOKEN_GRANT_STATUS.GRANTED; readonly tokens: SessionTokens }
  | { readonly status: typeof TOKEN_GRANT_STATUS.REJECTED }
  | { readonly status: typeof TOKEN_GRANT_STATUS.UNAVAILABLE };

export type RevocationResult = {
  readonly status: (typeof REVOCATION_STATUS)[keyof typeof REVOCATION_STATUS];
};

export type ExchangeCodeParams = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

export type KeycloakTokenClient = {
  readonly exchangeCode: (params: ExchangeCodeParams) => Promise<TokenGrantResult>;
  readonly refresh: (refreshToken: string) => Promise<TokenGrantResult>;
  readonly revoke: (refreshToken: string) => Promise<RevocationResult>;
};

export type KeycloakTokenClientSettings = {
  readonly tokenUrl: string;
  readonly logoutUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    refresh_expires_in: z.number().int().min(0),
  })
  .transform((body): SessionTokens => ({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresInSeconds: body.expires_in,
    refreshExpiresInSeconds: body.refresh_expires_in,
  }));

async function postForm(
  url: string,
  form: Readonly<Record<string, string>>,
): Promise<Response | undefined> {
  try {
    return await fetch(url, {
      method: HTTP_METHOD.POST,
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(KEYCLOAK_REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    return undefined;
  }
}

async function readGrant(response: Response | undefined): Promise<TokenGrantResult> {
  const unavailable = { status: TOKEN_GRANT_STATUS.UNAVAILABLE } as const;
  if (response === undefined) return unavailable;
  if (response.status === HTTP_STATUS.BAD_REQUEST) return { status: TOKEN_GRANT_STATUS.REJECTED };
  if (response.status !== HTTP_STATUS.OK) return unavailable;
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) return unavailable;
  return { status: TOKEN_GRANT_STATUS.GRANTED, tokens: parsed.data };
}

function buildClientForm(settings: KeycloakTokenClientSettings): Record<string, string> {
  return {
    [OAUTH_FIELD.CLIENT_ID]: settings.clientId,
    [OAUTH_FIELD.CLIENT_SECRET]: settings.clientSecret,
  };
}

async function revokeRefreshToken(
  settings: KeycloakTokenClientSettings,
  refreshToken: string,
): Promise<RevocationResult> {
  const response = await postForm(settings.logoutUrl, {
    ...buildClientForm(settings),
    [OAUTH_FIELD.REFRESH_TOKEN]: refreshToken,
  });
  const isDone =
    response?.status === HTTP_STATUS.NO_CONTENT || response?.status === HTTP_STATUS.BAD_REQUEST;
  return { status: isDone ? REVOCATION_STATUS.REVOKED : REVOCATION_STATUS.UNAVAILABLE };
}

export function createKeycloakTokenClient(
  settings: KeycloakTokenClientSettings,
): KeycloakTokenClient {
  const requestGrant = async (form: Readonly<Record<string, string>>): Promise<TokenGrantResult> =>
    readGrant(await postForm(settings.tokenUrl, { ...buildClientForm(settings), ...form }));

  return {
    exchangeCode: (params) =>
      requestGrant({
        [OAUTH_FIELD.GRANT_TYPE]: OAUTH_GRANT_TYPE.AUTHORIZATION_CODE,
        [OAUTH_FIELD.CODE]: params.code,
        [OAUTH_FIELD.CODE_VERIFIER]: params.codeVerifier,
        [OAUTH_FIELD.REDIRECT_URI]: params.redirectUri,
      }),
    refresh: (refreshToken) =>
      requestGrant({
        [OAUTH_FIELD.GRANT_TYPE]: OAUTH_GRANT_TYPE.REFRESH_TOKEN,
        [OAUTH_FIELD.REFRESH_TOKEN]: refreshToken,
      }),
    revoke: (refreshToken) => revokeRefreshToken(settings, refreshToken),
  };
}
