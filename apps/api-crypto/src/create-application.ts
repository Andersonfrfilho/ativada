// Copyright (c) 2026 Ada Technology. All rights reserved.
import { closeDatabase, openDatabase, pingDatabase, resolveUserBySubject } from '@crypto/database';

import { createAccessTokenVerifier } from './authentication/access-token-verifier.js';
import { createRemoteKeyResolver } from './authentication/remote-key-resolver.js';
import type { Environment } from './environment.js';
import { createRequestHandler, type RequestHandler } from './http/create-request-handler.js';
import type { Logger } from './logging/logger.js';
import { createRateLimiter } from './rate-limit/rate-limiter.js';
import { createSessionRouteDependencies } from './session/create-session-routes-dependencies.js';
import { createStreamTicketStore } from './stream/stream-ticket-store.js';
import { createRouter } from './router/create-router.js';
import { createApiRoutes } from './routes/create-api-routes.js';

export type Application = {
  readonly handler: RequestHandler;
  readonly closeResources: () => Promise<void>;
};

export type CreateApplicationParams = {
  readonly environment: Environment;
  readonly logger: Logger;
};

export function createApplication(params: CreateApplicationParams): Application {
  const { environment, logger } = params;
  const database = openDatabase(environment.DATABASE_URL);
  const verifyAccessToken = createAccessTokenVerifier({
    settings: {
      issuer: environment.KEYCLOAK_ISSUER,
      audience: environment.API_AUDIENCE,
      authorizedParties: environment.AUTHORIZED_PARTIES,
    },
    getKey: createRemoteKeyResolver({ jwksUrl: environment.KEYCLOAK_JWKS_URL }),
  });
  const router = createRouter({
    routes: createApiRoutes({
      checkDatabase: () => pingDatabase(database),
      session: createSessionRouteDependencies({ environment, verifyAccessToken }),
      streamTicketStore: createStreamTicketStore({ now: () => Date.now() }),
    }),
    verifyAccessToken,
    resolveUser: (subject) => resolveUserBySubject(database, subject),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    reportUnexpectedError: (error, traceId) => logger.error('unexpected error', { traceId, error }),
  });
  return {
    handler: createRequestHandler({
      router,
      corsAllowedOrigins: environment.CORS_ALLOWED_ORIGINS,
      logger,
    }),
    closeResources: () => closeDatabase(database),
  };
}
