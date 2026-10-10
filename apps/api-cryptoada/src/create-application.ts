// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createProfileRepository,
  openDatabase,
  pingDatabase,
  resolveUserBySubject,
} from '@cryptoada/database';

import { createAccountRouteDependencies } from './account/create-account-route-dependencies.js';
import { createAdminRouteDependencies } from './admin/create-admin-route-dependencies.js';
import { createAccessTokenVerifier } from './authentication/access-token-verifier.js';
import { createRemoteKeyResolver } from './authentication/remote-key-resolver.js';
import type { Environment } from './environment.js';
import { createRequestHandler, type RequestHandler } from './http/create-request-handler.js';
import { createIdentityAdmin } from './identity/create-identity-admin.js';
import type { Logger } from './logging/logger.js';
import { UNEXPECTED_ERROR_LOG_MESSAGE } from './logging/logging.constant.js';
import { createGetProfileUseCase, createUpdateProfileUseCase } from './profile/profile.use-case.js';
import { createTelegramRouteDependencies } from './telegram/create-telegram-route-dependencies.js';
import { createRateLimiter } from './rate-limit/rate-limiter.js';
import { createSessionRouteDependencies } from './session/create-session-routes-dependencies.js';
import { createStreamTicketStore } from './stream/stream-ticket-store.js';
import { createRouter, type Router } from './router/create-router.js';
import { createApiRoutes } from './routes/create-api-routes.js';

export type Application = {
  readonly handler: RequestHandler;
  readonly closeResources: () => Promise<void>;
};

export type CreateApplicationParams = {
  readonly environment: Environment;
  readonly logger: Logger;
};

type DatabaseHandle = ReturnType<typeof openDatabase>;
type VerifyAccessToken = ReturnType<typeof createAccessTokenVerifier>;
type IdentityAdmin = ReturnType<typeof createIdentityAdmin>;

type ApiRouterParams = {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly database: DatabaseHandle;
  readonly identity: IdentityAdmin;
  readonly verifyAccessToken: VerifyAccessToken;
};

function createVerifyAccessToken(environment: Environment): VerifyAccessToken {
  return createAccessTokenVerifier({
    settings: {
      issuer: environment.KEYCLOAK_ISSUER,
      audience: environment.API_AUDIENCE,
      authorizedParties: environment.AUTHORIZED_PARTIES,
    },
    getKey: createRemoteKeyResolver({ jwksUrl: environment.KEYCLOAK_JWKS_URL }),
  });
}

function createApiRouter(params: ApiRouterParams): Router {
  const { environment, logger, database, identity, verifyAccessToken } = params;
  const profileRepository = createProfileRepository(database);
  return createRouter({
    routes: createApiRoutes({
      checkDatabase: () => pingDatabase(database),
      session: createSessionRouteDependencies({ environment, verifyAccessToken }),
      account: createAccountRouteDependencies({ database, identity, now: () => Date.now() }),
      profile: {
        getProfile: createGetProfileUseCase(profileRepository),
        updateProfile: createUpdateProfileUseCase(profileRepository),
      },
      telegram: createTelegramRouteDependencies({
        environment,
        database,
        logger,
        now: () => Date.now(),
      }),
      admin: createAdminRouteDependencies({ identity, database }),
      streamTicketStore: createStreamTicketStore({ now: () => Date.now() }),
    }),
    verifyAccessToken,
    resolveUser: (subject) => resolveUserBySubject(database, subject),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    reportUnexpectedError: (error, traceId) =>
      logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { traceId, error }),
  });
}

export function createApplication(params: CreateApplicationParams): Application {
  const { environment, logger } = params;
  const database = openDatabase(environment.DATABASE_URL);
  const router = createApiRouter({
    environment,
    logger,
    database,
    identity: createIdentityAdmin({ environment, now: () => Date.now() }),
    verifyAccessToken: createVerifyAccessToken(environment),
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
