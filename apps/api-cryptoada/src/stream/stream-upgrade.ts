// Copyright (c) 2026 Ada Technology. All rights reserved.
import { USER_RESOLUTION_STATUS, type UserResolution } from '@cryptoada/database';

import {
  AccountBlockedError,
  AccountDeletedError,
} from '../authentication/authentication.error.js';
import { OriginNotAllowedError } from '../http/origin-not-allowed.error.js';
import { enforceRateLimit } from '../rate-limit/enforce-rate-limit.js';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import {
  resolveClientAddress,
  toRateLimitAddressKey,
} from '../rate-limit/resolve-client-address.js';
import { HTTP_HEADER, HTTP_METHOD } from '../shared/http/http.constant.js';
import {
  MAX_TICKET_LENGTH,
  STREAM_TICKET_PARAMETER,
  WEBSOCKET_UPGRADE_HEADER_VALUE,
} from './stream.constant.js';
import {
  StreamLimitReachedError,
  StreamTicketInvalidError,
  StreamUnavailableError,
  StreamUpgradeRequiredError,
} from './stream.error.js';
import type { StreamHub } from './stream-hub.js';
import type { StreamSocketData } from './stream-socket.types.js';
import type { StreamTicketClaims, StreamTicketStore } from './stream-ticket-store.js';

export type UpgradeDependencies = {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly trustedProxyHops: number;
  readonly hub: StreamHub;
  readonly maxSocketsPerUser: number;
  readonly ticketStore: StreamTicketStore;
  readonly rateLimiter: RateLimiter;
  readonly resolveUser: (subject: string) => Promise<UserResolution>;
  readonly now: () => number;
  readonly isReady: () => boolean;
};

export type UpgradeRequest = {
  readonly request: Request;
  readonly socketAddress: string | undefined;
};

function assertWebSocketRequest(request: Request): void {
  const upgrade = request.headers.get(HTTP_HEADER.UPGRADE)?.toLowerCase();
  if (request.method !== HTTP_METHOD.GET || upgrade !== WEBSOCKET_UPGRADE_HEADER_VALUE) {
    throw new StreamUpgradeRequiredError();
  }
}

function assertAllowedOrigin(dependencies: UpgradeDependencies, request: Request): void {
  const origin = request.headers.get(HTTP_HEADER.ORIGIN);
  if (origin === null || !dependencies.allowedOrigins.has(origin))
    throw new OriginNotAllowedError();
}

function readTicketParameter(request: Request): string {
  const ticket = new URL(request.url).searchParams.get(STREAM_TICKET_PARAMETER);
  if (ticket === null || ticket.length === 0 || ticket.length > MAX_TICKET_LENGTH) {
    throw new StreamTicketInvalidError();
  }
  return ticket;
}

async function assertActiveAccount(
  dependencies: UpgradeDependencies,
  claims: StreamTicketClaims,
): Promise<void> {
  let resolution: UserResolution;
  try {
    resolution = await dependencies.resolveUser(claims.keycloakSubject);
  } catch {
    throw new StreamUnavailableError();
  }
  if (resolution.status === USER_RESOLUTION_STATUS.DELETED) throw new AccountDeletedError();
  if (resolution.status === USER_RESOLUTION_STATUS.BLOCKED) throw new AccountBlockedError();
  if (resolution.userId !== claims.userId) throw new StreamTicketInvalidError();
}

function createSocketData(
  dependencies: UpgradeDependencies,
  claims: StreamTicketClaims,
): StreamSocketData {
  return {
    connectionId: crypto.randomUUID(),
    userId: claims.userId,
    keycloakSubject: claims.keycloakSubject,
    expiresAtMilliseconds: claims.sessionExpiresAtMilliseconds,
    lastActivityAtMilliseconds: dependencies.now(),
    messageWindowStartMilliseconds: 0,
    messageCount: 0,
    subscribedPairs: new Set<string>(),
  };
}

// Tudo o que decide se o handshake vira WebSocket, nesta ordem, e tudo ANTES do upgrade (deny-by-default): upgrade
// de verdade, limite por endereço, `Origin` na lista, tempo real pronto (LISTEN confirmado), ticket de uso único,
// conta ativa, ticket com sessão viva e teto de sockets do usuário. Cada recusa é um erro do envelope de sempre.
export async function authorizeUpgrade(
  dependencies: UpgradeDependencies,
  upgrade: UpgradeRequest,
): Promise<StreamSocketData> {
  const { request } = upgrade;
  assertWebSocketRequest(request);
  const clientAddress = resolveClientAddress({
    socketAddress: upgrade.socketAddress,
    forwardedFor: request.headers.get(HTTP_HEADER.FORWARDED_FOR),
    trustedProxyHops: dependencies.trustedProxyHops,
  });
  enforceRateLimit({
    rateLimiter: dependencies.rateLimiter,
    policy: RATE_LIMIT_POLICY.STREAM_UPGRADE_CLIENT_ADDRESS,
    key: toRateLimitAddressKey(clientAddress),
  });
  assertAllowedOrigin(dependencies, request);
  const ticket = readTicketParameter(request);
  // Antes de consumir o ticket: uma recusa por indisponibilidade deixa o cliente tentar de novo com o mesmo ticket.
  if (!dependencies.isReady()) throw new StreamUnavailableError();
  const claims = dependencies.ticketStore.consumeTicket(ticket);
  if (claims === undefined) throw new StreamTicketInvalidError();
  await assertActiveAccount(dependencies, claims);
  if (claims.sessionExpiresAtMilliseconds <= dependencies.now())
    throw new StreamTicketInvalidError();
  if (dependencies.hub.countForUser(claims.userId) >= dependencies.maxSocketsPerUser) {
    throw new StreamLimitReachedError();
  }
  return createSocketData(dependencies, claims);
}
