// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createProfileRepository,
  createRunQueueRepository,
  createStrategyRepository,
  pingDatabase,
  resolveUserBySubject,
  type DatabaseHandle,
} from '@ativada/database';

import { createAccountRouteDependencies } from './account/create-account-route-dependencies.js';
import { createApiOutageReporter } from './health/create-api-outage-reporter.js';
import { createDatabaseHealthDependencies } from './health/create-health-dependencies.js';
import { createAdminRouteDependencies } from './admin/create-admin-route-dependencies.js';
import type { AccessTokenVerifier } from './authentication/access-token-verifier.js';
import type { UserResolver } from './authentication/resolve-authenticated-user.js';
import { isDocumentationEnvironment } from './docs/documentation-environment.js';
import type { Environment } from './environment.js';
import type { createIdentityAdmin } from './identity/create-identity-admin.js';
import type { Logger } from './logging/logger.js';
import {
  EXAMPLE_SEEDING_FAILED_LOG_MESSAGE,
  UNEXPECTED_ERROR_LOG_MESSAGE,
} from './logging/logging.constant.js';
import { createGetProfileUseCase, createUpdateProfileUseCase } from './profile/profile.use-case.js';
import { createTelegramRouteDependencies } from './telegram/create-telegram-route-dependencies.js';
import { createRateLimiter } from './rate-limit/rate-limiter.js';
import type { ComputeGoalCombination, ComputeHorizonLine } from './goals/goal-evaluation-pool.js';
import type { RunDispatcher } from './runs/run-dispatcher.js';
import { createSessionRouteDependencies } from './session/create-session-routes-dependencies.js';
import { createExampleSeedingUserResolver } from './strategies/example-seeding-user-resolver.js';
import { createSeedExampleStrategyUseCase } from './strategies/seed-example-strategy.use-case.js';
import type { ListenerHealth } from './stream/listener-health.js';
import type { StreamTicketStore } from './stream/stream-ticket-store.js';
import { createRouter, type Router } from './router/create-router.js';
import { createApiRoutes, type ApiRouteDependencies } from './routes/create-api-routes.js';
import { createDomainRouteDependencies } from './routes/create-domain-route-dependencies.js';

type IdentityAdmin = ReturnType<typeof createIdentityAdmin>;

export type ApiRouterParams = {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly database: DatabaseHandle;
  readonly identity: IdentityAdmin;
  readonly verifyAccessToken: AccessTokenVerifier;
  readonly dispatcher: RunDispatcher;
  readonly ticketStore: StreamTicketStore;
  readonly closeUserSockets: (userId: string) => void;
  readonly readListenerHealth: () => ListenerHealth;
  readonly computeGoal: ComputeGoalCombination;
  readonly computeHorizon: ComputeHorizonLine;
};

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

type ScopedDependenciesParams = {
  readonly database: DatabaseHandle;
  readonly identity: IdentityAdmin;
  readonly closeUserSockets: (userId: string) => void;
};

// Conta e administração fecham os sockets da conta que bloqueiam ou apagam (T4.4): por isso recebem o fechador.
function createScopedDependencies(
  params: ScopedDependenciesParams,
): Pick<ApiRouteDependencies, 'account' | 'admin'> {
  const { database, identity, closeUserSockets } = params;
  return {
    account: createAccountRouteDependencies({
      database,
      identity,
      now: () => Date.now(),
      closeUserSockets,
    }),
    admin: createAdminRouteDependencies({ identity, database, closeUserSockets }),
  };
}

function createProfileDependencies(database: DatabaseHandle): ApiRouteDependencies['profile'] {
  const profileRepository = createProfileRepository(database);
  return {
    getProfile: createGetProfileUseCase(profileRepository),
    updateProfile: createUpdateProfileUseCase(profileRepository),
  };
}

type RouteAssemblyParams = {
  readonly params: ApiRouterParams;
  readonly domain: ReturnType<typeof createDomainRouteDependencies>;
};

function assembleRouteDependencies(assembly: RouteAssemblyParams): ApiRouteDependencies {
  const { params, domain } = assembly;
  const { environment, logger, database, identity, verifyAccessToken } = params;
  return {
    checkDatabase: () => pingDatabase(database),
    readRunQueueSummary: () => createRunQueueRepository(database).readQueueSummary(),
    readListenerHealth: params.readListenerHealth,
    ...createDatabaseHealthDependencies(database, environment.WORKER_HEARTBEAT_SECONDS),
    session: createSessionRouteDependencies({ environment, verifyAccessToken }),
    ...createScopedDependencies({ database, identity, closeUserSockets: params.closeUserSockets }),
    profile: createProfileDependencies(database),
    telegram: createTelegramRouteDependencies({
      environment,
      database,
      logger,
      now: () => Date.now(),
    }),
    streamTicketStore: params.ticketStore,
    ...domain,
    isDocumentationEnabled: isDocumentationEnvironment(environment.ENV),
  };
}

export function createApiRouter(params: ApiRouterParams): Router {
  const { environment, logger, database, verifyAccessToken } = params;
  const rateLimiter = createRateLimiter({ now: () => Date.now() });
  const outage = createApiOutageReporter({ database, logger });
  const domain = createDomainRouteDependencies({
    environment,
    database,
    dispatcher: params.dispatcher,
    now: () => Date.now(),
    reportUnexpectedError: (error) => logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error }),
    rateLimiter,
    computeGoal: params.computeGoal,
    computeHorizon: params.computeHorizon,
  });
  return createRouter({
    routes: createApiRoutes(assembleRouteDependencies({ params, domain })),
    verifyAccessToken,
    resolveUser: createSeedingUserResolver({ database, logger }),
    rateLimiter,
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    reportUnexpectedError: (error, traceId) =>
      logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { traceId, error }),
    reportDatabaseOutage: outage.reportOutage,
    reportDatabaseRecovery: outage.reportRecovery,
  });
}
