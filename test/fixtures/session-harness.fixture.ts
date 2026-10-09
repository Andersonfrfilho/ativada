// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createSessionRouteDependencies } from '../../apps/api-crypto/src/session/create-session-routes-dependencies.js';
import { createSessionRoutes } from '../../apps/api-crypto/src/session/session.routes.js';
import { createStreamTicketStore } from '../../apps/api-crypto/src/stream/stream-ticket-store.js';
import type { StreamTicketStore } from '../../apps/api-crypto/src/stream/stream-ticket-store.js';
import { createStreamTicketRoutes } from '../../apps/api-crypto/src/stream/stream-ticket.routes.js';
import { createLocalJWKSet } from './jose.fixture.js';
import { ALLOWED_ORIGIN, createApiHarness, type ApiHarness } from './api-harness.fixture.js';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_CODE_VERIFIER,
  FAKE_VALID_CODE,
  startFakeKeycloak,
  type FakeKeycloak,
} from './fake-keycloak.fixture.js';
import { signTestToken } from './token-signing.fixture.js';

export const ALLOWED_REDIRECT_URI = `${ALLOWED_ORIGIN}/auth/callback`;
export const SESSION_URL_PATH = '/v1/session';
export const REFRESH_URL_PATH = '/v1/session/refresh';
export const COOKIE_NAME = '__Host-crypto_refresh';

export type SessionHarness = {
  readonly api: ApiHarness;
  readonly keycloak: FakeKeycloak;
  readonly ticketStore: StreamTicketStore;
  readonly setKeyResolverFailing: (isFailing: boolean) => void;
  readonly setAccessTokenClaims: (claims: Readonly<Record<string, unknown>>) => void;
  readonly stop: () => Promise<void>;
};

export async function createSessionHarness(): Promise<SessionHarness> {
  let isKeyResolverFailing = false;
  let accessTokenClaims: Readonly<Record<string, unknown>> = {};
  const signing: { harness?: ApiHarness } = {};
  const keycloak = startFakeKeycloak({
    issueAccessToken: () => {
      if (signing.harness === undefined) throw new Error('harness not ready');
      return signTestToken({ key: signing.harness.key, claims: accessTokenClaims });
    },
  });
  const ticketStore = createStreamTicketStore({ now: () => Date.now() });
  const api = await createApiHarness({
    getKeyOverride: (header, token) => {
      if (isKeyResolverFailing) return Promise.reject(new Error('jwks unreachable'));
      if (signing.harness === undefined) return Promise.reject(new Error('harness not ready'));
      return createLocalJWKSet({ keys: [signing.harness.key.publicJwk] })(header, token);
    },
    routeFactory: (verifyAccessToken) => [
      ...createSessionRoutes(
        createSessionRouteDependencies({
          verifyAccessToken,
          environment: {
            KEYCLOAK_TOKEN_URL: keycloak.tokenUrl,
            KEYCLOAK_LOGOUT_URL: keycloak.logoutUrl,
            KEYCLOAK_SESSION_CLIENT_ID: FAKE_CLIENT_ID,
            KEYCLOAK_SESSION_CLIENT_SECRET: FAKE_CLIENT_SECRET,
            SESSION_ALLOWED_REDIRECT_URIS: [ALLOWED_REDIRECT_URI],
            CORS_ALLOWED_ORIGINS: [ALLOWED_ORIGIN],
          },
        }),
      ),
      ...createStreamTicketRoutes(ticketStore),
    ],
  });
  signing.harness = api;
  return {
    api,
    keycloak,
    ticketStore,
    setKeyResolverFailing: (isFailing): void => {
      isKeyResolverFailing = isFailing;
    },
    setAccessTokenClaims: (claims): void => {
      accessTokenClaims = claims;
    },
    stop: async (): Promise<void> => {
      await api.stop();
      await keycloak.stop();
    },
  };
}

export type SessionCallParams = {
  readonly path: string;
  readonly method: string;
  readonly cookie?: string;
  readonly body?: unknown;
  readonly socketAddress?: string;
  readonly omitHeaders?: readonly string[];
  readonly origin?: string;
};

export function callSession(harness: SessionHarness, params: SessionCallParams): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: params.origin ?? ALLOWED_ORIGIN,
    'X-Requested-With': 'fetch',
    'Content-Type': 'application/json',
  };
  for (const name of params.omitHeaders ?? []) delete headers[name];
  if (params.cookie !== undefined) headers['Cookie'] = `${COOKIE_NAME}=${params.cookie}`;
  return harness.api.sendThroughHandler({
    path: params.path,
    method: params.method,
    headers,
    socketAddress: params.socketAddress ?? '203.0.113.20',
    ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
  });
}

export function buildValidExchangeBody(): Record<string, string> {
  return {
    code: FAKE_VALID_CODE,
    codeVerifier: FAKE_CODE_VERIFIER,
    redirectUri: ALLOWED_REDIRECT_URI,
  };
}

export function readCookieValue(response: Response): string {
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  const prefix = `${COOKIE_NAME}=`;
  return setCookie.slice(prefix.length, setCookie.indexOf(';'));
}

export async function signIn(harness: SessionHarness): Promise<string> {
  const response = await callSession(harness, {
    path: SESSION_URL_PATH,
    method: 'POST',
    body: buildValidExchangeBody(),
  });
  return readCookieValue(response);
}
