// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { PublicRouteContext, Route } from '../router/route.types.js';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { assertCsrfProtection } from './csrf-guard.js';
import type { CreateSessionUseCase } from './create-session.use-case.js';
import type { EndSessionUseCase } from './end-session.use-case.js';
import type { SessionTokens } from './keycloak-token-client.js';
import { readExchangeCodeRequest } from './read-exchange-code-request.js';
import type { RefreshSessionUseCase } from './refresh-session.use-case.js';
import {
  buildClearedRefreshCookie,
  buildRefreshCookie,
  readRefreshCookie,
} from './session-cookie.js';
import { SESSION_PATH, SESSION_REFRESH_PATH } from './session.constant.js';
import { SessionUnavailableError } from './session.error.js';

export type SessionRouteDependencies = {
  readonly createSession: CreateSessionUseCase;
  readonly refreshSession: RefreshSessionUseCase;
  readonly endSession: EndSessionUseCase;
  readonly allowedOrigins: ReadonlySet<string>;
};

function buildTokensResult(tokens: SessionTokens): RouteResult {
  return {
    status: HTTP_STATUS.OK,
    data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresInSeconds },
    headers: {
      [HTTP_HEADER.SET_COOKIE]: buildRefreshCookie({
        value: tokens.refreshToken,
        maxAgeSeconds: tokens.refreshExpiresInSeconds,
      }),
    },
  };
}

// Com o Keycloak fora o cookie sai do navegador mesmo assim; a resposta 503 pede para repetir a revogação.
async function endSessionClearingCookie(
  dependencies: SessionRouteDependencies,
  refreshToken: string | undefined,
): Promise<void> {
  try {
    await dependencies.endSession(refreshToken);
  } catch (error: unknown) {
    if (!(error instanceof SessionUnavailableError)) throw error;
    throw new SessionUnavailableError({ [HTTP_HEADER.SET_COOKIE]: buildClearedRefreshCookie() });
  }
}

type SessionHandler = (context: PublicRouteContext) => Promise<RouteResult>;

function createSessionHandlers(dependencies: SessionRouteDependencies): {
  readonly create: SessionHandler;
  readonly refresh: SessionHandler;
  readonly end: SessionHandler;
} {
  const { allowedOrigins } = dependencies;
  return {
    create: async ({ request }): Promise<RouteResult> => {
      assertCsrfProtection({ request, allowedOrigins });
      const input = await readExchangeCodeRequest(request);
      return buildTokensResult(await dependencies.createSession(input));
    },
    refresh: async ({ request }): Promise<RouteResult> => {
      assertCsrfProtection({ request, allowedOrigins });
      return buildTokensResult(await dependencies.refreshSession(readRefreshCookie(request)));
    },
    end: async ({ request }): Promise<RouteResult> => {
      assertCsrfProtection({ request, allowedOrigins });
      await endSessionClearingCookie(dependencies, readRefreshCookie(request));
      return {
        status: HTTP_STATUS.NO_CONTENT,
        headers: { [HTTP_HEADER.SET_COOKIE]: buildClearedRefreshCookie() },
      };
    },
  };
}

export function createSessionRoutes(dependencies: SessionRouteDependencies): readonly Route[] {
  const handlers = createSessionHandlers(dependencies);
  const access = ROUTE_ACCESS.PUBLIC;
  const rateLimitPolicy = RATE_LIMIT_POLICY.SESSION_CLIENT_ADDRESS;
  return [
    {
      access,
      rateLimitPolicy,
      method: HTTP_METHOD.POST,
      path: SESSION_PATH,
      handler: handlers.create,
    },
    {
      access,
      rateLimitPolicy,
      method: HTTP_METHOD.POST,
      path: SESSION_REFRESH_PATH,
      handler: handlers.refresh,
    },
    {
      access,
      rateLimitPolicy,
      method: HTTP_METHOD.DELETE,
      path: SESSION_PATH,
      handler: handlers.end,
    },
  ];
}
