// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
} from '../../test/fixtures/fake-keycloak-admin.fixture.js';
import { startFakeKeycloak, type FakeKeycloak } from '../../test/fixtures/fake-keycloak.fixture.js';
import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../../packages/market-data/test-support/fake-binance-stream-server.js';
import {
  createApiRunsContext,
  type ApiRunsContext,
} from '../api-runs-test/api-runs-test-context.js';
import {
  closeLiveTestContext,
  createLiveTestContext,
  type LiveTestContext,
} from '../live-test/live-test-context.js';
import {
  ALLOWED_ORIGIN,
  MAX_SOCKETS_PER_USER,
  MINUTE_MILLISECONDS,
  PING_INTERVAL_SECONDS,
  PONG_TIMEOUT_SECONDS,
  STREAM_PATH,
  TICKER_STALE_SECONDS,
  TICKETS_PATH,
  TICKETS_PER_MINUTE_BUDGET,
} from './stream-api-test.constant.js';

export function reportLine(message: string): void {
  process.stdout.write(`stream-api-test: ${message}\n`);
}

export type ReceivedMessage = { readonly receivedAt: number; readonly message: unknown };
export type CloseInfo = {
  readonly code: number;
  readonly reason: string;
  readonly closedAt: number;
};

export type TestSocket = {
  readonly socket: WebSocket;
  readonly received: ReceivedMessage[];
  readonly opened: Promise<void>;
  readonly closed: Promise<CloseInfo>;
  readonly send: (text: string) => void;
};

export type UpgradeAttempt = { readonly status: number; readonly code: string | undefined };

export type StreamApiContext = {
  readonly databaseUrl: string;
  readonly live: LiveTestContext;
  readonly api: ApiRunsContext;
  readonly keycloak: FakeKeycloak;
  // A Binance falsa (REST da hora e stream do ticker) que a API consome neste teste.
  readonly binance: FakeBinanceStreamServer;
  readonly issueTicket: (params: {
    readonly subject: string;
    readonly lifetimeSeconds?: number;
  }) => Promise<string>;
  readonly connect: (params: {
    readonly ticket: string;
    readonly origin?: string | null;
  }) => TestSocket;
  readonly attempt: (params: {
    readonly ticket?: string;
    readonly origin?: string | null;
  }) => Promise<UpgradeAttempt>;
  readonly stopApi: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

function wsUrl(baseUrl: string): string {
  return baseUrl.replace(/^http/, 'ws');
}

function readCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = Object.getOwnPropertyDescriptor(body, 'error')?.value as unknown;
  if (typeof error !== 'object' || error === null) return undefined;
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value as unknown;
  return typeof code === 'string' ? code : undefined;
}

// Sobe a API DE VERDADE (com o stream), um Keycloak falso só para o Admin API (bloquear conta) e o contexto do worker.
export async function createStreamApiContext(databaseUrl: string): Promise<StreamApiContext> {
  const keycloak = startFakeKeycloak({
    issueAccessToken: () => Promise.reject(new Error('sem login')),
  });
  const binance = startFakeBinanceStreamServer();
  Bun.env['TICKER_STREAM_ENABLED'] = 'true';
  Bun.env['BINANCE_BASE_URL'] = binance.restUrl;
  Bun.env['BINANCE_STREAM_URL'] = binance.streamUrl;
  Bun.env['TICKER_STALE_SECONDS'] = TICKER_STALE_SECONDS;
  Bun.env['KEYCLOAK_ADMIN_API_URL'] = keycloak.adminApiUrl;
  Bun.env['KEYCLOAK_TOKEN_URL'] = keycloak.tokenUrl;
  Bun.env['KEYCLOAK_SERVICE_CLIENT_ID'] = FAKE_SERVICE_CLIENT_ID;
  Bun.env['KEYCLOAK_SERVICE_CLIENT_SECRET'] = FAKE_SERVICE_CLIENT_SECRET;
  Bun.env['STREAM_MAX_SOCKETS_PER_USER'] = MAX_SOCKETS_PER_USER;
  Bun.env['STREAM_PING_INTERVAL_SECONDS'] = PING_INTERVAL_SECONDS;
  Bun.env['STREAM_PONG_TIMEOUT_SECONDS'] = PONG_TIMEOUT_SECONDS;
  const api = await createApiRunsContext(databaseUrl);
  const live = await createLiveTestContext(databaseUrl);
  const issuedAt: number[] = [];
  let isApiStopped = false;

  // O limite de 10 tickets por minuto por IP vale para o teste também: ele espera a reposição, não a contorna.
  async function paceTickets(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (issuedAt.length > 0 && now - (issuedAt[0] ?? now) >= MINUTE_MILLISECONDS)
        issuedAt.shift();
      if (issuedAt.length < TICKETS_PER_MINUTE_BUDGET) break;
      await Bun.sleep(500);
    }
    issuedAt.push(Date.now());
  }

  async function issueTicket(params: {
    readonly subject: string;
    readonly lifetimeSeconds?: number;
  }): Promise<string> {
    await paceTickets();
    const response = await api.call({
      subject: params.subject,
      method: 'POST',
      path: TICKETS_PATH,
      ...(params.lifetimeSeconds === undefined ? {} : { lifetimeSeconds: params.lifetimeSeconds }),
    });
    if (response.status !== 201) throw new Error(`ticket: status ${response.status}`);
    const data = (response.json as { data: { ticket: string } }).data;
    return data.ticket;
  }

  function connect(params: {
    readonly ticket: string;
    readonly origin?: string | null;
  }): TestSocket {
    const origin = params.origin === undefined ? ALLOWED_ORIGIN : params.origin;
    const headers = origin === null ? {} : { Origin: origin };
    const socket = new WebSocket(
      `${wsUrl(api.api.baseUrl)}${STREAM_PATH}?ticket=${params.ticket}`,
      {
        headers,
      },
    );
    const received: ReceivedMessage[] = [];
    socket.onmessage = (event): void => {
      received.push({ receivedAt: Date.now(), message: JSON.parse(String(event.data)) as unknown });
    };
    const opened = new Promise<void>((resolve) => {
      socket.onopen = (): void => resolve();
    });
    const closed = new Promise<CloseInfo>((resolve) => {
      socket.onclose = (event): void =>
        resolve({ code: event.code, reason: event.reason, closedAt: Date.now() });
    });
    return { socket, received, opened, closed, send: (text) => socket.send(text) };
  }

  async function attempt(params: {
    readonly ticket?: string;
    readonly origin?: string | null;
  }): Promise<UpgradeAttempt> {
    const origin = params.origin === undefined ? ALLOWED_ORIGIN : params.origin;
    const headers = new Headers({
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': btoa('0123456789abcdef'),
    });
    if (origin !== null) headers.set('Origin', origin);
    const query = params.ticket === undefined ? '' : `?ticket=${params.ticket}`;
    const response = await fetch(`${api.api.baseUrl}${STREAM_PATH}${query}`, { headers });
    const body: unknown = await response.json().catch(() => undefined);
    return { status: response.status, code: readCode(body) };
  }

  async function stopApi(): Promise<void> {
    if (isApiStopped) return;
    isApiStopped = true;
    await api.stop();
  }

  return {
    databaseUrl,
    live,
    api,
    keycloak,
    binance,
    issueTicket,
    connect,
    attempt,
    stopApi,
    stop: async (): Promise<void> => {
      await stopApi();
      await keycloak.stop();
      await binance.stop();
      await closeLiveTestContext(live);
    },
  };
}
