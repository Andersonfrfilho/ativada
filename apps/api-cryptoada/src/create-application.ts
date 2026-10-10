// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createRunQueueRepository,
  openDatabase,
  type DatabaseHandle,
} from '@cryptoada/database';

import type { BacktestThreadRunner } from './backtest/backtest-thread-runner.js';
import { createAccessTokenVerifier } from './authentication/access-token-verifier.js';
import { createRemoteKeyResolver } from './authentication/remote-key-resolver.js';
import { createApiRouter } from './create-api-router.js';
import type { Environment } from './environment.js';
import { createRequestHandler, type RequestHandler } from './http/create-request-handler.js';
import { createIdentityAdmin } from './identity/create-identity-admin.js';
import type { Logger } from './logging/logger.js';
import { UNEXPECTED_ERROR_LOG_MESSAGE } from './logging/logging.constant.js';
import { createApplicationRunners } from './runs/create-application-runners.js';
import { createApplicationDispatcher } from './runs/queue/create-application-dispatcher.js';
import type { RunQueueDispatcher } from './runs/queue/run-queue-dispatcher.types.js';
import {
  createApplicationStream,
  type ApplicationStream,
} from './stream/create-application-stream.js';
import type { StreamEndpoint } from './stream/create-stream-endpoint.js';
import { createStreamTicketStore } from './stream/stream-ticket-store.js';
import type { WalkForwardThreadRunner } from './walk-forward/walk-forward-thread-runner.js';

export type Application = {
  readonly handler: RequestHandler;
  // As rotas de execução despacham pela porta `RunDispatcher`, cuja implementação é a FILA durável com tetos por
  // usuário (T3.6); cada execução roda numa `worker_thread` destes executores.
  readonly backtestRunner: BacktestThreadRunner;
  readonly walkForwardRunner: WalkForwardThreadRunner;
  readonly dispatcher: RunQueueDispatcher;
  // O WebSocket de tempo real (T4.4): `startServer` o liga a `GET /v1/stream`; `start` abre o escutador de NOTIFY.
  readonly stream: StreamEndpoint;
  // Boot da fila: recupera as órfãs e redespacha o que ficou `queued`. Chamar uma vez, depois de subir o servidor.
  readonly start: () => Promise<void>;
  readonly closeResources: () => Promise<void>;
};

export type CreateApplicationParams = {
  readonly environment: Environment;
  readonly logger: Logger;
};

type VerifyAccessToken = ReturnType<typeof createAccessTokenVerifier>;

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

type LifecycleParams = {
  readonly database: DatabaseHandle;
  readonly dispatcher: RunQueueDispatcher;
  readonly stream: ApplicationStream;
};

function createLifecycle(params: LifecycleParams): Pick<Application, 'start' | 'closeResources'> {
  const { database, dispatcher, stream } = params;
  return {
    start: async (): Promise<void> => {
      stream.start();
      await dispatcher.start();
    },
    closeResources: async (): Promise<void> => {
      await stream.close();
      await dispatcher.stop();
      await closeDatabase(database);
    },
  };
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
  const ticketStore = createStreamTicketStore({ now: () => Date.now() });
  const stream = createApplicationStream({ environment, logger, database, ticketStore });
  const router = createApiRouter({
    environment,
    logger,
    database,
    identity: createIdentityAdmin({ environment, now: () => Date.now() }),
    verifyAccessToken: createVerifyAccessToken(environment),
    dispatcher,
    ticketStore,
    closeUserSockets: (userId) => void stream.endpoint.closeUser(userId),
    readListenerHealth: stream.readListenerHealth,
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
    stream: stream.endpoint,
    ...createLifecycle({ database, dispatcher, stream }),
  };
}
