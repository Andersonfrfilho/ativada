// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunEventListener,
  resolveRunOwnerScope,
  resolveUserBySubject,
  type DatabaseHandle,
  type NotificationListener,
} from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import type { Environment } from '../environment.js';
import type { Logger } from '../logging/logger.js';
import { UNEXPECTED_ERROR_LOG_MESSAGE } from '../logging/logging.constant.js';
import { createRateLimiter } from '../rate-limit/rate-limiter.js';
import { STREAM_LOG_MESSAGE } from './stream.constant.js';
import { createStreamEndpoint, type StreamEndpoint } from './create-stream-endpoint.js';
import { createRunEventDispatcher, type RunEventDispatcher } from './run-event-dispatcher.js';
import { toStreamLimits } from './stream-environment.js';
import type { StreamTicketStore } from './stream-ticket-store.js';

export type ApplicationStreamParams = {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly database: DatabaseHandle;
  readonly ticketStore: StreamTicketStore;
};

export type ApplicationStream = {
  readonly endpoint: StreamEndpoint;
  // Abre o escutador de NOTIFY e o varredor de ping/expiração; o endpoint só aceita sockets depois do LISTEN confirmado.
  readonly start: () => void;
  readonly close: () => Promise<void>;
};

type ListenerWiring = {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly endpoint: StreamEndpoint;
  readonly dispatcher: RunEventDispatcher;
  readonly reportError: (error: unknown) => void;
};

function openRunEventListener(wiring: ListenerWiring): NotificationListener {
  const { logger, endpoint, dispatcher } = wiring;
  return createRunEventListener({
    databaseUrl: wiring.environment.DATABASE_URL,
    onEvent: (event) => void dispatcher.dispatch(event),
    onMalformed: () => logger.warn(STREAM_LOG_MESSAGE, { event: 'stream.event.malformed' }),
    onListening: (event) => {
      endpoint.handleListenerListening(event.isReconnect);
      logger.info(STREAM_LOG_MESSAGE, { event: 'stream.listening', ...event });
    },
    onLost: (end) => {
      if (end.wasListening) endpoint.handleListenerLost();
      logger.warn(STREAM_LOG_MESSAGE, { event: 'stream.listener.lost', ...end });
    },
    onHandlerError: wiring.reportError,
  });
}

// A API é quem liga o worker ao painel: o worker avisa por NOTIFY `{ runId, kind, eventId }` e a API resolve o dono pelo banco.
export function createApplicationStream(params: ApplicationStreamParams): ApplicationStream {
  const { environment, logger, database } = params;
  const now = (): number => Date.now();
  const reportError = (error: unknown): void =>
    logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error });
  const endpoint = createStreamEndpoint({
    allowedOrigins: environment.CORS_ALLOWED_ORIGINS,
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    limits: toStreamLimits(environment),
    ticketStore: params.ticketStore,
    rateLimiter: createRateLimiter({ now }),
    resolveUser: (subject) => resolveUserBySubject(database, subject),
    now,
    log: (fields) => logger.info(STREAM_LOG_MESSAGE, fields),
    reportUnexpectedError: reportError,
  });
  const dispatcher = createRunEventDispatcher({
    hub: endpoint.hub,
    now,
    reportError,
    resolveOwner: async (runId) => (await resolveRunOwnerScope(database, runId))?.ownerUserId,
  });
  let listener: NotificationListener | undefined;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  return {
    endpoint,
    start: (): void => {
      if (listener !== undefined) return;
      listener = openRunEventListener({ environment, logger, endpoint, dispatcher, reportError });
      const intervalMilliseconds =
        environment.STREAM_PING_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND;
      sweeper = setInterval(endpoint.sweep, intervalMilliseconds);
    },
    close: async (): Promise<void> => {
      clearInterval(sweeper);
      endpoint.closeAll();
      await listener?.close();
    },
  };
}
