// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserResolution } from '@ativada/database';

import { decorateResponse } from '../http/decorate-response.js';
import type { MarketSubscriptions } from '../market-stream/create-market-publisher.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { AppError } from '../shared/errors/app.error.js';
import { buildErrorResponse } from '../shared/http/response-envelope.js';
import {
  CLOSE_REASON,
  RESYNC_REASON,
  SERVER_MESSAGE_TYPE,
  STREAM_LOG_EVENT,
  STREAM_PATH,
  WEBSOCKET_CLOSE_CODE,
} from './stream.constant.js';
import { StreamUnavailableError } from './stream.error.js';
import { createStreamHub, type StreamHub } from './stream-hub.js';
import type { StreamLimits } from './stream-environment.js';
import type { StreamSocketData, UpgradeServer } from './stream-socket.types.js';
import { sweepStreamSockets } from './stream-sweep.js';
import type { StreamTicketStore } from './stream-ticket-store.js';
import { authorizeUpgrade } from './stream-upgrade.js';
import { createStreamWebSocketHandler, type StreamLog } from './stream-websocket-handler.js';

export type StreamEndpointDependencies = {
  readonly allowedOrigins: readonly string[];
  readonly trustedProxyHops: number;
  readonly limits: StreamLimits;
  readonly ticketStore: StreamTicketStore;
  readonly rateLimiter: RateLimiter;
  readonly resolveUser: (subject: string) => Promise<UserResolution>;
  readonly now: () => number;
  readonly log: StreamLog;
  readonly reportUnexpectedError: (error: unknown) => void;
  // O ticker público (T4.7): ausente = `subscribe` responde `MARKET_UNAVAILABLE`.
  readonly market?: MarketSubscriptions | undefined;
};

export type HandleUpgradeParams = {
  readonly request: Request;
  readonly server: UpgradeServer;
  readonly socketAddress: string | undefined;
};

export type StreamEndpoint = {
  readonly hub: StreamHub;
  readonly websocket: Bun.WebSocketHandler<StreamSocketData>;
  readonly isStreamRequest: (request: Request) => boolean;
  readonly handleUpgrade: (params: HandleUpgradeParams) => Promise<Response | undefined>;
  readonly isReady: () => boolean;
  readonly setReady: (isReady: boolean) => void;
  // Só depois do LISTEN confirmado a API aceita sockets; a volta depois de uma queda manda `resync` (nada se perdeu em silêncio).
  readonly handleListenerListening: (isReconnect: boolean) => void;
  readonly handleListenerLost: () => void;
  readonly sweep: () => void;
  readonly closeUser: (userId: string) => number;
  readonly closeAll: () => void;
};

function refusalResponse(
  error: unknown,
  reportUnexpectedError: (error: unknown) => void,
): Response {
  if (error instanceof AppError) return buildErrorResponse(error);
  reportUnexpectedError(error);
  return buildErrorResponse(new StreamUnavailableError());
}

type ReadyState = { isReady: boolean };

function createUpgradeHandler(
  dependencies: StreamEndpointDependencies,
  hub: StreamHub,
  state: ReadyState,
): StreamEndpoint['handleUpgrade'] {
  const upgradeDependencies = {
    allowedOrigins: new Set(dependencies.allowedOrigins),
    trustedProxyHops: dependencies.trustedProxyHops,
    hub,
    maxSocketsPerUser: dependencies.limits.maxSocketsPerUser,
    ticketStore: dependencies.ticketStore,
    rateLimiter: dependencies.rateLimiter,
    resolveUser: dependencies.resolveUser,
    now: dependencies.now,
    isReady: (): boolean => state.isReady,
  };
  return async (params) => {
    const traceId = crypto.randomUUID();
    try {
      const data = await authorizeUpgrade(upgradeDependencies, params);
      if (params.server.upgrade(params.request, { data })) return undefined;
      throw new StreamUnavailableError();
    } catch (error: unknown) {
      const response = refusalResponse(error, dependencies.reportUnexpectedError);
      dependencies.log({
        event: STREAM_LOG_EVENT.UPGRADE_REFUSED,
        status: response.status,
        traceId,
      });
      return decorateResponse({ response, allowedOrigin: undefined, traceId });
    }
  };
}

type ListenerControls = Pick<StreamEndpoint, 'handleListenerListening' | 'handleListenerLost'>;

function createListenerControls(hub: StreamHub, state: ReadyState): ListenerControls {
  return {
    handleListenerListening: (isReconnect): void => {
      state.isReady = true;
      if (isReconnect) {
        hub.broadcast({
          type: SERVER_MESSAGE_TYPE.RESYNC,
          reason: RESYNC_REASON.LISTENER_RESTORED,
        });
      }
    },
    handleListenerLost: (): void => {
      state.isReady = false;
      hub.broadcast({ type: SERVER_MESSAGE_TYPE.RESYNC, reason: RESYNC_REASON.LISTENER_LOST });
    },
  };
}

export function createStreamEndpoint(dependencies: StreamEndpointDependencies): StreamEndpoint {
  const { limits, now, log } = dependencies;
  const hub = createStreamHub({ maxSocketsPerUser: limits.maxSocketsPerUser });
  const state: ReadyState = { isReady: false };
  return {
    hub,
    websocket: createStreamWebSocketHandler({
      hub,
      maxMessageBytes: limits.maxMessageBytes,
      log,
      messages: {
        ticketStore: dependencies.ticketStore,
        resolveUser: dependencies.resolveUser,
        now,
        maxMessagesPerMinute: limits.maxMessagesPerMinute,
        reportUnexpectedError: dependencies.reportUnexpectedError,
        market: dependencies.market,
      },
    }),
    isStreamRequest: (request): boolean => new URL(request.url).pathname === STREAM_PATH,
    handleUpgrade: createUpgradeHandler(dependencies, hub, state),
    isReady: (): boolean => state.isReady,
    setReady: (isReady): void => {
      state.isReady = isReady;
    },
    ...createListenerControls(hub, state),
    sweep: (): void =>
      sweepStreamSockets({
        hub,
        nowMilliseconds: now(),
        pongTimeoutMilliseconds: limits.pongTimeoutMilliseconds,
      }),
    closeUser: (userId): number =>
      hub.closeUser(userId, WEBSOCKET_CLOSE_CODE.ACCOUNT_BLOCKED, CLOSE_REASON.ACCOUNT_INACTIVE),
    closeAll: (): void => hub.closeAll(WEBSOCKET_CLOSE_CODE.GOING_AWAY, CLOSE_REASON.SHUTTING_DOWN),
  };
}
