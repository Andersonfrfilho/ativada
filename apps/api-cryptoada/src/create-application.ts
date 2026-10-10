// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createProfileRepository,
  createRunQueueRepository,
  createStrategyRepository,
  openDatabase,
  pingDatabase,
  resolveUserBySubject,
} from '@cryptoada/database';
import { PRODUCTION_ENVIRONMENT } from '@cryptoada/environment';

import type { BacktestThreadRunner } from './backtest/backtest-thread-runner.js';
import { createAccountRouteDependencies } from './account/create-account-route-dependencies.js';
import { createAdminRouteDependencies } from './admin/create-admin-route-dependencies.js';
import { createAccessTokenVerifier } from './authentication/access-token-verifier.js';
import type { UserResolver } from './authentication/resolve-authenticated-user.js';
import { createRemoteKeyResolver } from './authentication/remote-key-resolver.js';
import type { Environment } from './environment.js';
import { createRequestHandler, type RequestHandler } from './http/create-request-handler.js';
import { createIdentityAdmin } from './identity/create-identity-admin.js';
import type { Logger } from './logging/logger.js';
import {
  EXAMPLE_SEEDING_FAILED_LOG_MESSAGE,
  UNEXPECTED_ERROR_LOG_MESSAGE,
} from './logging/logging.constant.js';
import { createGetProfileUseCase, createUpdateProfileUseCase } from './profile/profile.use-case.js';
import { createTelegramRouteDependencies } from './telegram/create-telegram-route-dependencies.js';
import { createRateLimiter } from './rate-limit/rate-limiter.js';
import { createApplicationRunners } from './runs/create-application-runners.js';
import { createApplicationDispatcher } from './runs/queue/create-application-dispatcher.js';
import type { RunQueueDispatcher } from './runs/queue/run-queue-dispatcher.types.js';
import type { RunDispatcher } from './runs/run-dispatcher.js';
import { createSessionRouteDependencies } from './session/create-session-routes-dependencies.js';
import { createExampleSeedingUserResolver } from './strategies/example-seeding-user-resolver.js';
import { createSeedExampleStrategyUseCase } from './strategies/seed-example-strategy.use-case.js';
import { createStreamTicketStore } from './stream/stream-ticket-store.js';
import { createRouter, type Router } from './router/create-router.js';
import { createApiRoutes } from './routes/create-api-routes.js';
import { createDomainRouteDependencies } from './routes/create-domain-route-dependencies.js';
import type { WalkForwardThreadRunner } from './walk-forward/walk-forward-thread-runner.js';

export type Application = {
  readonly handler: RequestHandler;
  // As rotas de execução despacham pela porta `RunDispatcher`, cuja implementação é a FILA durável com tetos por
  // usuário (T3.6); cada execução roda numa `worker_thread` destes executores.
  readonly backtestRunner: BacktestThreadRunner;
  readonly walkForwardRunner: WalkForwardThreadRunner;
  readonly dispatcher: RunQueueDispatcher;
  // Boot da fila: recupera as órfãs e redespacha o que ficou `queued`. Chamar uma vez, depois de subir o servidor.
  readonly start: () => Promise<void>;
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
  readonly dispatcher: RunDispatcher;
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

function createSeedingUserResolver(params: {
  readonly database: DatabaseHandle;
  readonly logger: Logger;
}): UserResolver {
  const { database, logger } = params;
  return createExampleSeedingUserResolver({
    resolveUser: (subject) => resolveUserBySubject(database, subject),
    seedExampleStrategy: createSeedExampleStrategyUseCase({
      strategies: createStrategyRepository(database),
    }),
    reportFailure: (error) => logger.error(EXAMPLE_SEEDING_FAILED_LOG_MESSAGE, { error }),
  });
}

function createApiRouter(params: ApiRouterParams): Router {
  const { environment, logger, database, identity, verifyAccessToken } = params;
  const profileRepository = createProfileRepository(database);
  const domain = createDomainRouteDependencies({
    environment,
    database,
    dispatcher: params.dispatcher,
    now: () => Date.now(),
  });
  return createRouter({
    routes: createApiRoutes({
      checkDatabase: () => pingDatabase(database),
      readRunQueueSummary: () => createRunQueueRepository(database).readQueueSummary(),
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
      ...domain,
      isDocumentationEnabled: environment.ENV !== PRODUCTION_ENVIRONMENT,
    }),
    verifyAccessToken,
    resolveUser: createSeedingUserResolver({ database, logger }),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    reportUnexpectedError: (error, traceId) =>
      logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { traceId, error }),
  });
}

export function createApplication(params: CreateApplicationParams): Application {
  const { environment, logger } = params;
  const database = openDatabase(environment.DATABASE_URL);
  const reportUnexpectedError = (error: unknown): void =>
    logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error });
  const runners = createApplicationRunners({ environment, database });
  // A TROCA da T3.4 para a T3.6: o despachante sem tetos deu lugar ao da fila durável, que reivindica as execuções do banco.
  const dispatcher = createApplicationDispatcher({
    environment,
    queue: createRunQueueRepository(database),
    runners,
    reportUnexpectedError,
  });
  const router = createApiRouter({
    environment,
    logger,
    database,
    identity: createIdentityAdmin({ environment, now: () => Date.now() }),
    verifyAccessToken: createVerifyAccessToken(environment),
    dispatcher,
  });
  return {
    handler: createRequestHandler({
      router,
      corsAllowedOrigins: environment.CORS_ALLOWED_ORIGINS,
      logger,
    }),
    backtestRunner: runners.backtestRunner,
    walkForwardRunner: runners.walkForwardRunner,
    dispatcher,
    start: () => dispatcher.start(),
    closeResources: async (): Promise<void> => {
      await dispatcher.stop();
      await closeDatabase(database);
    },
  };
}
