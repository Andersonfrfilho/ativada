// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPriceAlertEvaluationRepository,
  createRunEventListener,
  resolveRunOwnerScope,
  resolveUserBySubject,
  type DatabaseHandle,
  type NotificationListener,
} from '@cryptoada/database';
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';
import type { PriceTickListener } from '@cryptoada/market-data';

import type { Environment } from '../environment.js';
import type { Logger } from '../logging/logger.js';
import { UNEXPECTED_ERROR_LOG_MESSAGE } from '../logging/logging.constant.js';
import {
  createApplicationMarketStream,
  type ApplicationMarketStream,
} from '../market-stream/create-application-market-stream.js';
import { createRateLimiter } from '../rate-limit/rate-limiter.js';
import { STREAM_LOG_MESSAGE } from './stream.constant.js';
import { createStreamEndpoint, type StreamEndpoint } from './create-stream-endpoint.js';
import {
  createPriceAlertEventDispatcher,
  type PriceAlertEventDispatcher,
} from '../price-alerts/price-alert-event-dispatcher.js';
import { createRunEventDispatcher, type RunEventDispatcher } from './run-event-dispatcher.js';
import { logListenerLoss, toListenerHealth, type ListenerHealth } from './listener-health.js';
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
  // Fase 4b (T4b.7): o alerta de preço se registra aqui e recebe cada tick agregado uma vez; sem ticker, não recebe nada.
  readonly addPriceTickListener: (listener: PriceTickListener) => () => void;
  // Abre o escutador de NOTIFY e o varredor de ping/expiração; o endpoint só aceita sockets depois do LISTEN confirmado.
  readonly start: () => void;
  // O estado do escutador de NOTIFY para o `/v1/admin/health`: falha de configuração aparece ali, não só no log.
  readonly readListenerHealth: () => ListenerHealth;
  readonly close: () => Promise<void>;
};

type ListenerWiring = {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly endpoint: StreamEndpoint;
  readonly dispatcher: RunEventDispatcher;
  readonly priceAlertDispatcher: PriceAlertEventDispatcher;
  readonly reportError: (error: unknown) => void;
};

function openRunEventListener(wiring: ListenerWiring): NotificationListener {
  const { logger, endpoint, dispatcher, priceAlertDispatcher } = wiring;
  return createRunEventListener({
    databaseUrl: wiring.environment.DATABASE_URL,
    onEvent: (event) => void dispatcher.dispatch(event),
    onPriceAlert: (event) => void priceAlertDispatcher.dispatch(event),
    onMalformed: () => logger.warn(STREAM_LOG_MESSAGE, { event: 'stream.event.malformed' }),
    onListening: (event) => {
      endpoint.handleListenerListening(event.isReconnect);
      logger.info(STREAM_LOG_MESSAGE, { event: 'stream.listening', ...event });
    },
    onLost: (end) => {
      if (end.wasListening) endpoint.handleListenerLost();
      logListenerLoss(logger, end);
    },
    onHandlerError: wiring.reportError,
  });
}

function createEndpoint(
  params: ApplicationStreamParams,
  market: ApplicationMarketStream | undefined,
  reportError: (error: unknown) => void,
): StreamEndpoint {
  const { environment, logger, database } = params;
  return createStreamEndpoint({
    market: market?.publisher.subscriptions,
    allowedOrigins: environment.CORS_ALLOWED_ORIGINS,
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    limits: toStreamLimits(environment),
    ticketStore: params.ticketStore,
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    resolveUser: (subject) => resolveUserBySubject(database, subject),
    now: () => Date.now(),
    log: (fields) => logger.info(STREAM_LOG_MESSAGE, fields),
    reportUnexpectedError: reportError,
  });
}

type DispatcherParams = {
  readonly database: DatabaseHandle;
  readonly hub: StreamEndpoint['hub'];
  readonly reportError: (error: unknown) => void;
};

// Os dois avisos do banco (passo ao vivo e disparo de alerta de preço) resolvem o dono pelo banco e entregam só a ele.
function createDispatchers(params: DispatcherParams): {
  readonly dispatcher: RunEventDispatcher;
  readonly priceAlertDispatcher: PriceAlertEventDispatcher;
} {
  const { database, hub, reportError } = params;
  return {
    dispatcher: createRunEventDispatcher({
      hub,
      now: () => Date.now(),
      reportError,
      resolveOwner: async (runId) => (await resolveRunOwnerScope(database, runId))?.ownerUserId,
    }),
    priceAlertDispatcher: createPriceAlertEventDispatcher({
      hub,
      now: () => Date.now(),
      reportError,
      resolveOwner: createPriceAlertEvaluationRepository(database).findActiveOwnerId,
    }),
  };
}

// A API é quem liga o worker ao painel: o worker avisa por NOTIFY `{ runId, kind, eventId }` e a API resolve o dono pelo banco.
export function createApplicationStream(params: ApplicationStreamParams): ApplicationStream {
  const { environment, logger, database } = params;
  const reportError = (error: unknown): void =>
    logger.error(UNEXPECTED_ERROR_LOG_MESSAGE, { error });
  const market = environment.TICKER_STREAM_ENABLED
    ? createApplicationMarketStream({ environment, logger, reportError })
    : undefined;
  const endpoint = createEndpoint(params, market, reportError);
  const dispatchers = createDispatchers({ database, hub: endpoint.hub, reportError });
  let listener: NotificationListener | undefined;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  return {
    endpoint,
    addPriceTickListener: (priceListener) =>
      market?.publisher.addListener(priceListener) ?? ((): void => undefined),
    start: (): void => {
      if (listener !== undefined) return;
      market?.start();
      listener = openRunEventListener({
        environment,
        logger,
        endpoint,
        ...dispatchers,
        reportError,
      });
      const intervalMilliseconds =
        environment.STREAM_PING_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND;
      sweeper = setInterval(endpoint.sweep, intervalMilliseconds);
    },
    readListenerHealth: () => toListenerHealth(listener),
    close: async (): Promise<void> => {
      clearInterval(sweeper);
      endpoint.closeAll();
      await market?.close();
      await listener?.close();
    },
  };
}
