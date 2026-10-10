// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FAKE_KEYCLOAK_MODE = {
  OK: 'ok',
  INVALID_GRANT: 'invalid-grant',
  SERVER_ERROR: 'server-error',
  SLOW: 'slow',
} as const;

export type FakeKeycloakMode = (typeof FAKE_KEYCLOAK_MODE)[keyof typeof FAKE_KEYCLOAK_MODE];

import {
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
  FAKE_SERVICE_TOKEN,
  createFakeKeycloakAdmin,
  type FakeKeycloakAdmin,
} from './fake-keycloak-admin.fixture.js';

export const FAKE_CLIENT_ID = 'cryptoada-session';
export const FAKE_CLIENT_SECRET = 'fake-client-secret-value';
export const FAKE_VALID_CODE = 'fake-valid-code-value';
export const FAKE_CODE_VERIFIER = 'v'.repeat(64);
export const FAKE_REFRESH_LIFETIME_SECONDS = 1800;

const SLOW_RESPONSE_DELAY_MILLISECONDS = 150;
const ACCESS_TOKEN_LIFETIME_SECONDS = 300;

export type FakeKeycloakRequest = {
  readonly path: string;
  readonly form: Readonly<Record<string, string>>;
};

export type FakeKeycloak = {
  readonly tokenUrl: string;
  readonly logoutUrl: string;
  readonly adminApiUrl: string;
  readonly admin: FakeKeycloakAdmin;
  readonly events: string[];
  readonly setMode: (mode: FakeKeycloakMode) => void;
  readonly requests: () => readonly FakeKeycloakRequest[];
  readonly countRequests: (grantType: string) => number;
  readonly logoutCount: () => number;
  readonly stop: () => Promise<void>;
};

export type FakeKeycloakOptions = {
  readonly issueAccessToken: () => Promise<string>;
  readonly events?: string[];
};

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

type FormFields = Readonly<Record<string, string>>;

function createGrantEndpoints(options: FakeKeycloakOptions): {
  readonly handleToken: (form: FormFields) => Promise<Response>;
  readonly handleLogout: (form: FormFields) => Response;
} {
  let issuedRefreshTokens = 0;
  const activeRefreshTokens = new Set<string>();

  async function issueTokens(): Promise<Response> {
    issuedRefreshTokens += 1;
    const refreshToken = `fake-refresh-${issuedRefreshTokens}.${crypto.randomUUID()}`;
    activeRefreshTokens.add(refreshToken);
    return Response.json({
      access_token: await options.issueAccessToken(),
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      refresh_expires_in: FAKE_REFRESH_LIFETIME_SECONDS,
    });
  }

  async function handleToken(form: FormFields): Promise<Response> {
    if (form['grant_type'] === 'authorization_code') {
      const isValid =
        form['code'] === FAKE_VALID_CODE && form['code_verifier'] === FAKE_CODE_VERIFIER;
      return isValid ? issueTokens() : jsonError('invalid_grant', 400);
    }
    const presented = form['refresh_token'] ?? '';
    if (!activeRefreshTokens.has(presented)) {
      // Reuso de refresh antigo derruba a sessão do cliente (ADR 0001 §l).
      activeRefreshTokens.clear();
      return jsonError('invalid_grant', 400);
    }
    activeRefreshTokens.delete(presented);
    return issueTokens();
  }

  function handleLogout(form: FormFields): Response {
    const presented = form['refresh_token'] ?? '';
    if (!activeRefreshTokens.delete(presented)) return jsonError('invalid_grant', 400);
    return new Response(null, { status: 204 });
  }

  return { handleToken, handleLogout };
}

export function startFakeKeycloak(options: FakeKeycloakOptions): FakeKeycloak {
  let mode: FakeKeycloakMode = FAKE_KEYCLOAK_MODE.OK;
  const events = options.events ?? [];
  const admin = createFakeKeycloakAdmin({ events });
  const received: FakeKeycloakRequest[] = [];
  const { handleToken, handleLogout } = createGrantEndpoints(options);

  function respondToServiceAccount(form: FormFields): Response {
    const isValid =
      form['client_id'] === FAKE_SERVICE_CLIENT_ID &&
      form['client_secret'] === FAKE_SERVICE_CLIENT_SECRET;
    if (!isValid) return jsonError('invalid_client', 401);
    return Response.json({ access_token: FAKE_SERVICE_TOKEN, expires_in: 60 });
  }

  async function respond(path: string, form: FormFields): Promise<Response> {
    if (form['grant_type'] === 'client_credentials') return respondToServiceAccount(form);
    if (form['client_id'] !== FAKE_CLIENT_ID || form['client_secret'] !== FAKE_CLIENT_SECRET) {
      return jsonError('invalid_client', 401);
    }
    if (mode === FAKE_KEYCLOAK_MODE.SERVER_ERROR) return jsonError('server_error', 500);
    if (mode === FAKE_KEYCLOAK_MODE.INVALID_GRANT) return jsonError('invalid_grant', 400);
    if (mode === FAKE_KEYCLOAK_MODE.SLOW) await Bun.sleep(SLOW_RESPONSE_DELAY_MILLISECONDS);
    return path.endsWith('/logout') ? handleLogout(form) : handleToken(form);
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/admin/')) return admin.handle(request);
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      received.push({ path, form });
      return respond(path, form);
    },
  });

  return {
    tokenUrl: `http://127.0.0.1:${server.port}/token`,
    logoutUrl: `http://127.0.0.1:${server.port}/logout`,
    adminApiUrl: `http://127.0.0.1:${server.port}/admin`,
    admin,
    events,
    setMode: (nextMode): void => {
      mode = nextMode;
    },
    requests: () => received,
    countRequests: (grantType) =>
      received.filter((entry) => entry.form['grant_type'] === grantType).length,
    logoutCount: () => received.filter((entry) => entry.path.endsWith('/logout')).length,
    stop: async (): Promise<void> => {
      await server.stop(true);
    },
  };
}
