// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createDatabaseOutageGuard } from '../packages/database/src/index.js';
import { createResilientDatabase } from '../packages/database/src/connection/resilient-database.js';
import { DatabaseUnavailableError } from '../packages/database/src/connection/connection-error.js';
import type { LatestWorkerHeartbeat } from '../packages/database/src/worker-heartbeats/worker-heartbeat.types.js';
import type { Route } from '../apps/api-ativada/src/router/route.types.js';
import type { RouteResult } from '../apps/api-ativada/src/shared/http/response-envelope.js';
import {
  createFlakyServer,
  FLAKY_MODE,
  FLAKY_SECRET_URL,
  FlakyPostgresError,
  wrapLikeDrizzle,
  type FlakyServer,
} from '../packages/database/test-support/flaky-sql.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';
import { createApiHarness, type ApiHarness } from './fixtures/api-harness.fixture.js';
import { loadApiApp, type ApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const app: ApiApp = await loadApiApp();

const HEALTH_PATH = '/v1/health';
const ADMIN_HEALTH_PATH = '/v1/admin/health';
const HEARTBEAT_SECONDS = 15;
const STALE_AFTER_MILLISECONDS = HEARTBEAT_SECONDS * 3 * 1_000;
const ADMIN_CLAIMS = { realm_access: { roles: ['user', 'admin'] }, acr: '2' };
const FORBIDDEN_TEXT = [FLAKY_SECRET_URL, 's3cret', 'postgres://', 'select 1', 'ERR_POSTGRES'];

type Rig = {
  readonly server: FlakyServer;
  readonly database: ReturnType<typeof createResilientDatabase>;
  readonly clock: { now: number };
};

function createRig(): Rig {
  const server = createFlakyServer();
  const clock = { now: 1_000_000 };
  const database = createResilientDatabase({
    openClient: () => server.openClient(),
    queryTimeoutMilliseconds: 30_000,
    confirmTimeoutMilliseconds: 1_000,
    now: () => clock.now,
    random: () => 0.5,
    failureThreshold: 2,
    reconnectBaseMilliseconds: 1_000,
    reconnectMaxMilliseconds: 30_000,
  });
  return { server, database, clock };
}

async function ping(rig: Rig): Promise<boolean> {
  try {
    await rig.database.unsafe('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function notUsed(): Promise<never> {
  return Promise.reject(new Error('not used'));
}

function okHandler(): Promise<RouteResult> {
  return Promise.resolve({ status: 200, data: {} });
}

function heartbeatOfAge(ageMilliseconds: number): LatestWorkerHeartbeat {
  return { instanceId: 'worker-x', lastBeatAt: new Date(1_700_000_000_000), ageMilliseconds };
}

function buildRoutes(
  rig: Rig,
  heartbeat: () => Promise<LatestWorkerHeartbeat | undefined>,
): readonly Route[] {
  const health = app.healthDependencies.createHealthDependencies({
    ping: () => ping(rig),
    readDatabaseHealth: () => rig.database.readHealth(),
    findLatestHeartbeat: heartbeat,
    heartbeatSeconds: HEARTBEAT_SECONDS,
  });
  return app.apiRoutes.createApiRoutes(
    buildApiRouteDependencies(() => ping(rig), false, undefined, undefined, health),
  );
}

function routerOf(
  routes: readonly Route[],
  harness?: ApiHarness,
): ReturnType<typeof app.router.createRouter> {
  return app.router.createRouter({
    routes,
    verifyAccessToken: harness?.verifyAccessToken ?? notUsed,
    resolveUser: harness?.resolveUser ?? notUsed,
    rateLimiter: app.rateLimiter.createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: 0,
    reportUnexpectedError: () => undefined,
  });
}

function get(router: ReturnType<typeof routerOf>, path: string, token?: string): Promise<Response> {
  return router({
    request: new Request(`http://api.test${path}`, {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    }),
    socketAddress: '203.0.113.9',
    traceId: 'trace-outage',
  });
}

function expectNothingInternal(text: string): void {
  for (const forbidden of FORBIDDEN_TEXT) expect(text).not.toContain(forbidden);
}

describe('GET /v1/health with the database out and back', () => {
  test('answers 200 { status: ok } with the database answering and 503 { status: degraded } without it', async () => {
    const rig = createRig();
    const router = routerOf(buildRoutes(rig, () => Promise.resolve(undefined)));
    const healthy = await get(router, HEALTH_PATH);
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toStrictEqual({ data: { status: 'ok' } });

    rig.server.setMode(FLAKY_MODE.REFUSED);
    const down = await get(router, HEALTH_PATH);
    const text = await down.clone().text();
    expect(down.status).toBe(503);
    expect(await down.json()).toStrictEqual({ data: { status: 'degraded' } });
    expect(down.headers.get('Cache-Control')).toBe('no-store');
    expectNothingInternal(text);

    rig.server.setMode(FLAKY_MODE.HEALTHY);
    rig.clock.now += 60_000;
    const back = await get(router, HEALTH_PATH);
    expect(back.status).toBe(200);
    expect(await back.json()).toStrictEqual({ data: { status: 'ok' } });
    await rig.database.close();
  });

  test('a database that does not answer within 1 s gives 503 but does NOT mark the gate down', async () => {
    const rig = createRig();
    const router = routerOf(buildRoutes(rig, () => Promise.resolve(undefined)));
    await ping(rig);
    rig.server.setMode(FLAKY_MODE.HUNG);
    const startedAt = Date.now();
    const response = await get(router, HEALTH_PATH);
    expect(response.status).toBe(503);
    expect(await response.json()).toStrictEqual({ data: { status: 'degraded' } });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(rig.database.readHealth().state).toBe('up');
    await rig.database.close();
  });
});

describe('GET /v1/admin/health with the database out', () => {
  let harness: ApiHarness;
  beforeAll(async () => {
    harness = await createApiHarness();
  });
  afterAll(async () => {
    await harness.stop();
  });

  async function adminHealth(
    rig: Rig,
    heartbeat: LatestWorkerHeartbeat | undefined,
  ): Promise<{ data: Record<string, unknown> }> {
    const router = routerOf(
      buildRoutes(rig, () => Promise.resolve(heartbeat)),
      harness,
    );
    const token = await signTestToken({ key: harness.key, claims: ADMIN_CLAIMS });
    const response = await get(router, ADMIN_HEALTH_PATH, token);
    return (await response.json()) as { data: Record<string, unknown> };
  }

  test('reports the database state and the last failure CODE, never the message', async () => {
    const rig = createRig();
    rig.server.setMode(FLAKY_MODE.REFUSED);
    await ping(rig);
    const body = await adminHealth(rig, undefined);
    expect(body.data['database']).toMatchObject({
      state: 'down',
      consecutiveFailures: 1,
      lastFailureCode: 'ERR_POSTGRES_CONNECTION_REFUSED',
    });
    expect(Object.keys(body.data['database'] as object).sort()).toStrictEqual([
      'consecutiveFailures',
      'downSince',
      'lastFailureAt',
      'lastFailureCode',
      'state',
    ]);
    expect((body.data['checks'] as { database: string }).database).toBe('down');
    expect(body.data['status']).toBe('degraded');
    expectNothingInternal(JSON.stringify(body).replace('ERR_POSTGRES_CONNECTION_REFUSED', ''));
    await rig.database.close();
  });

  test('worker: alive up to 3 heartbeats of age, stale after, unknown without a row', async () => {
    const rig = createRig();
    const alive = await adminHealth(rig, heartbeatOfAge(STALE_AFTER_MILLISECONDS));
    expect(alive.data['worker']).toStrictEqual({
      lastHeartbeatAt: 1_700_000_000_000,
      ageSeconds: 45,
      state: 'alive',
    });
    const stale = await adminHealth(rig, heartbeatOfAge(STALE_AFTER_MILLISECONDS + 1));
    expect((stale.data['worker'] as { state: string }).state).toBe('stale');
    const unknown = await adminHealth(rig, undefined);
    expect(unknown.data['worker']).toStrictEqual({
      lastHeartbeatAt: null,
      ageSeconds: null,
      state: 'unknown',
    });
    await rig.database.close();
  });

  test('worker is unknown, not an error, when the heartbeat cannot be read', async () => {
    const rig = createRig();
    const router = routerOf(
      buildRoutes(rig, () =>
        Promise.reject(wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED'))),
      ),
      harness,
    );
    const token = await signTestToken({ key: harness.key, claims: ADMIN_CLAIMS });
    const response = await get(router, ADMIN_HEALTH_PATH, token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { worker: { state: string } } };
    expect(body.data.worker.state).toBe('unknown');
    await rig.database.close();
  });
});

describe('routes with the database out answer 503 DATABASE_UNAVAILABLE instead of 500', () => {
  const reported: unknown[] = [];
  const summaries: unknown[] = [];

  function routeThatFails(error: Error): Route {
    return {
      method: 'GET',
      path: '/v1/test/outage',
      access: 'public',
      handler: () => Promise.reject(error),
    };
  }

  function sendFailing(error: Error): Promise<Response> {
    reported.length = 0;
    summaries.length = 0;
    const router = app.router.createRouter({
      routes: [routeThatFails(error)],
      verifyAccessToken: notUsed,
      resolveUser: notUsed,
      rateLimiter: app.rateLimiter.createRateLimiter({ now: () => Date.now() }),
      trustedProxyHops: 0,
      reportUnexpectedError: (failure) => reported.push(failure),
      reportDatabaseOutage: (failure) => summaries.push(failure),
    });
    return get(router, '/v1/test/outage');
  }

  async function expectUnavailable(response: Response): Promise<void> {
    const text = await response.clone().text();
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('5');
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(Object.keys(body.error).sort()).toStrictEqual(['code', 'message']);
    expectNothingInternal(text);
    expect(reported).toStrictEqual([]);
    expect(summaries).toHaveLength(1);
  }

  test('the gate fast-failure (DatabaseUnavailableError) becomes 503', async () => {
    await expectUnavailable(
      await sendFailing(new DatabaseUnavailableError('DATABASE_UNAVAILABLE')),
    );
  });

  test('the query timeout becomes 503 too', async () => {
    await expectUnavailable(
      await sendFailing(new DatabaseUnavailableError('DATABASE_QUERY_TIMEOUT')),
    );
  });

  test('a first connection failure still wrapped by Drizzle becomes 503, without the query or its parameters', async () => {
    const wrapped = wrapLikeDrizzle(
      new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED'),
      'select 1',
      ['s3cret'],
    );
    await expectUnavailable(await sendFailing(wrapped));
  });

  test('an error of the query (unique violation) is still a 500 and goes to the report', async () => {
    const response = await sendFailing(
      wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_SERVER_ERROR', '23505')),
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(reported).toHaveLength(1);
    expect(summaries).toStrictEqual([]);
  });

  test('a refused connection to ANOTHER integration (Keycloak, Telegram) is a 500, never DATABASE_UNAVAILABLE', async () => {
    const refused = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    const response = await sendFailing(new Error('fetch failed', { cause: refused }));
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(summaries).toStrictEqual([]);
  });

  test('an authenticated route whose user lookup hits the dead database answers 503', async () => {
    const harness = await createApiHarness();
    try {
      const router = app.router.createRouter({
        routes: [
          {
            method: 'GET',
            path: '/v1/test/user',
            access: 'user',
            handler: okHandler,
          },
        ],
        verifyAccessToken: harness.verifyAccessToken,
        resolveUser: () =>
          Promise.reject(
            wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_REFUSED')),
          ),
        rateLimiter: app.rateLimiter.createRateLimiter({ now: () => Date.now() }),
        trustedProxyHops: 0,
        reportUnexpectedError: () => undefined,
      });
      const token = await signTestToken({ key: harness.key, claims: { acr: '2' } });
      const response = await get(router, '/v1/test/user', token);
      expect(response.status).toBe(503);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'DATABASE_UNAVAILABLE',
      );
    } finally {
      await harness.stop();
    }
  });

  test('the recovery hook runs after a success and never after an error', async () => {
    let recoveries = 0;
    const router = app.router.createRouter({
      routes: [
        {
          method: 'GET',
          path: '/v1/test/ok',
          access: 'public',
          handler: okHandler,
        },
      ],
      verifyAccessToken: notUsed,
      resolveUser: notUsed,
      rateLimiter: app.rateLimiter.createRateLimiter({ now: () => Date.now() }),
      trustedProxyHops: 0,
      reportUnexpectedError: () => undefined,
      reportDatabaseRecovery: () => {
        recoveries += 1;
      },
    });
    await get(router, '/v1/test/ok');
    await get(router, '/v1/test/missing');
    expect(recoveries).toBe(1);
  });
});

describe('the API summary of an outage', () => {
  test('uses the shared guard: one line per minute, code only', () => {
    const lines: { message: string; fields: Record<string, unknown> }[] = [];
    let now = 0;
    const guard = createDatabaseOutageGuard({
      readHealth: () => ({
        state: 'down',
        consecutiveFailures: 1,
        downSince: 0,
        nextAttemptAt: 1,
        lastFailureCode: 'ERR_POSTGRES_CONNECTION_CLOSED',
        lastFailureErrno: undefined,
        lastFailureAt: 0,
      }),
      now: () => now,
      write: (entry) => lines.push({ message: entry.message, fields: { ...entry.fields } }),
    });
    for (let request = 0; request < 1_000; request += 1) {
      now += 100;
      guard.handleFailure(
        wrapLikeDrizzle(new FlakyPostgresError('ERR_POSTGRES_CONNECTION_CLOSED')),
      );
    }
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[0]?.fields['code']).toBe('ERR_POSTGRES_CONNECTION_CLOSED');
    expectNothingInternal(JSON.stringify(lines).replace(/ERR_POSTGRES_CONNECTION_CLOSED/g, ''));
  });
});
