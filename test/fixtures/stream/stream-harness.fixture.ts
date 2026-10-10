// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  USER_RESOLUTION_STATUS,
  type UserId,
  type UserResolution,
} from '../../../packages/database/src/index.js';
import { createOwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { StreamSocketData } from '../../../apps/api-cryptoada/src/stream/stream-socket.types.js';
import { userIdFromDatabase } from '../../../packages/database/src/ownership/user-id.js';
import { createManualClock, waitFor, type ManualClock } from '../wait-for.fixture.js';
import { createManualTimers } from '../ticker/manual-timers.fixture.js';
import { loadStreamApp, type StreamApp } from './stream-app.fixture.js';

export const ALLOWED_ORIGIN = 'http://127.0.0.1:56103';
export const FOREIGN_ORIGIN = 'http://evil.example';
export const SESSION_LIFETIME_MILLISECONDS = 300_000;
export const START_TIME = 1_760_000_000_000;
const TICKET_USERS: Readonly<Record<string, UserId>> = {
  'subject-stream-a': userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e'),
  'subject-stream-b': userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0f'),
};

export type CloseInfo = { readonly code: number; readonly reason: string };

export type StreamClient = {
  readonly socket: WebSocket;
  readonly messages: unknown[];
  readonly opened: Promise<void>;
  readonly closed: Promise<CloseInfo>;
  readonly send: (text: string) => void;
};

export type UpgradeAttempt = { readonly status: number; readonly code: string | undefined };

export type StreamHarness = {
  readonly app: StreamApp;
  readonly clock: ManualClock;
  readonly endpoint: ReturnType<StreamApp['endpoint']['createStreamEndpoint']>;
  readonly logLines: string[];
  readonly errors: unknown[];
  // Os códigos de fechamento vistos pelo SERVIDOR (o cliente do Bun mostra 1000 no lugar de 1001).
  readonly serverCloseCodes: number[];
  readonly market: HarnessMarket | undefined;
  readonly issueTicket: (subject: string, lifetimeMilliseconds?: number) => string;
  readonly setResolution: (subject: string, status: UserResolution['status']) => void;
  readonly connect: (params: { ticket: string; origin?: string | null }) => StreamClient;
  readonly attempt: (params: {
    ticket?: string | undefined;
    origin?: string | null;
    isUpgrade?: boolean;
  }) => Promise<UpgradeAttempt>;
  readonly stop: () => Promise<void>;
};

export type HarnessMarket = {
  readonly publisher: ReturnType<StreamApp['marketPublisher']['createMarketPublisher']>;
  readonly timers: ReturnType<typeof createManualTimers>;
};

export type StreamHarnessOptions = {
  // O ticker público (T4.7): publicador com temporizadores à mão, pares BTCUSDT, ETHUSDT e SOLUSDT, teto de 2 pares por socket.
  readonly hasMarket?: boolean;
  readonly maxSocketsPerUser?: number;
  readonly maxMessageBytes?: number;
  readonly maxMessagesPerMinute?: number;
  readonly isReady?: boolean;
};

export async function createStreamHarness(
  options: StreamHarnessOptions = {},
): Promise<StreamHarness> {
  const app = await loadStreamApp();
  const clock = createManualClock(START_TIME);
  const logLines: string[] = [];
  const errors: unknown[] = [];
  const serverCloseCodes: number[] = [];
  const statuses = new Map<string, UserResolution['status']>();
  const ticketStore = app.ticketStore.createStreamTicketStore({ now: clock.now });
  const marketTimers = createManualTimers();
  const market: HarnessMarket | undefined =
    options.hasMarket === true
      ? {
          timers: marketTimers,
          publisher: app.marketPublisher.createMarketPublisher<number>({
            pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
            maxPairsPerSocket: 2,
            staleAfterMilliseconds: 10_000,
            now: clock.now,
            serverTime: clock.now,
            setTimer: marketTimers.setTimer,
            clearTimer: marketTimers.clearTimer,
            reportError: (error) => void errors.push(error),
          }),
        }
      : undefined;
  const endpoint = app.endpoint.createStreamEndpoint({
    allowedOrigins: [ALLOWED_ORIGIN],
    trustedProxyHops: 0,
    limits: {
      maxSocketsPerUser: options.maxSocketsPerUser ?? 5,
      maxMessageBytes: options.maxMessageBytes ?? 4_096,
      pongTimeoutMilliseconds: 60_000,
      maxMessagesPerMinute: options.maxMessagesPerMinute ?? 60,
    },
    ticketStore,
    market: market?.publisher.subscriptions,
    rateLimiter: app.rateLimiter.createRateLimiter({ now: clock.now }),
    resolveUser: (subject) => {
      const userId = TICKET_USERS[subject];
      if (userId === undefined) return Promise.reject(new Error('assunto desconhecido'));
      const status = statuses.get(subject) ?? USER_RESOLUTION_STATUS.ACTIVE;
      if (status === USER_RESOLUTION_STATUS.ACTIVE) {
        return Promise.resolve({
          status: USER_RESOLUTION_STATUS.ACTIVE,
          userId,
          scope: createOwnerScope(userId),
        });
      }
      return Promise.resolve({ status });
    },
    now: clock.now,
    log: (fields) => void logLines.push(JSON.stringify(fields)),
    reportUnexpectedError: (error) => void errors.push(error),
  });
  endpoint.setReady(options.isReady ?? true);
  const server = Bun.serve<StreamSocketData>({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, bunServer) =>
      endpoint.isStreamRequest(request)
        ? endpoint.handleUpgrade({
            request,
            server: bunServer,
            socketAddress: bunServer.requestIP(request)?.address,
          })
        : new Response('not found', { status: 404 }),
    websocket: {
      ...endpoint.websocket,
      close: async (socket, code, reason): Promise<void> => {
        serverCloseCodes.push(code);
        await endpoint.websocket.close?.(socket, code, reason);
      },
    },
  });
  const baseUrl = `127.0.0.1:${server.port}`;

  function connect(params: { ticket: string; origin?: string | null }): StreamClient {
    const origin = params.origin === undefined ? ALLOWED_ORIGIN : params.origin;
    const headers = origin === null ? {} : { Origin: origin };
    const socket = new WebSocket(`ws://${baseUrl}/v1/stream?ticket=${params.ticket}`, { headers });
    const messages: unknown[] = [];
    socket.onmessage = (event): void => {
      messages.push(JSON.parse(String(event.data)) as unknown);
    };
    const opened = new Promise<void>((resolve) => {
      socket.onopen = (): void => resolve();
    });
    const closed = new Promise<CloseInfo>((resolve) => {
      socket.onclose = (event): void => resolve({ code: event.code, reason: event.reason });
    });
    return { socket, messages, opened, closed, send: (text) => socket.send(text) };
  }

  async function attempt(params: {
    ticket?: string | undefined;
    origin?: string | null;
    isUpgrade?: boolean;
  }): Promise<UpgradeAttempt> {
    const origin = params.origin === undefined ? ALLOWED_ORIGIN : params.origin;
    const headers = new Headers();
    if (origin !== null) headers.set('Origin', origin);
    if (params.isUpgrade !== false) {
      headers.set('Upgrade', 'websocket');
      headers.set('Connection', 'Upgrade');
      headers.set('Sec-WebSocket-Version', '13');
      headers.set('Sec-WebSocket-Key', btoa('0123456789abcdef'));
    }
    const query = params.ticket === undefined ? '' : `?ticket=${params.ticket}`;
    const response = await fetch(`http://${baseUrl}/v1/stream${query}`, { headers });
    const body: unknown = await response.json().catch(() => undefined);
    const code = (body as { error?: { code?: string } } | undefined)?.error?.code;
    return { status: response.status, code };
  }

  return {
    app,
    clock,
    endpoint,
    logLines,
    errors,
    serverCloseCodes,
    market,
    issueTicket: (subject, lifetimeMilliseconds = SESSION_LIFETIME_MILLISECONDS): string => {
      const userId = TICKET_USERS[subject];
      if (userId === undefined) throw new Error('assunto desconhecido');
      return ticketStore.issueTicket({
        userId,
        keycloakSubject: subject,
        sessionExpiresAtMilliseconds: clock.now() + lifetimeMilliseconds,
      }).ticket;
    },
    setResolution: (subject, status) => void statuses.set(subject, status),
    connect,
    attempt,
    stop: async (): Promise<void> => {
      endpoint.closeAll();
      // A promessa do `stop(true)` do Bun não resolve depois que o servidor fechou um socket: não se espera por ela.
      void server.stop(true);
      await waitFor(() => endpoint.hub.size() === 0, 'sockets encerrados');
    },
  };
}
