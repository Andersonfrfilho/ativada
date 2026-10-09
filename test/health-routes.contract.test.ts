// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createApiRoutes } from '../apps/api-crypto/src/routes/create-api-routes.js';
import { createRouter } from '../apps/api-crypto/src/router/create-router.js';
import { createRateLimiter } from '../apps/api-crypto/src/rate-limit/rate-limiter.js';
import { ROUTE_ACCESS } from '../apps/api-crypto/src/router/route-access.constant.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';
import { createApiHarness, type ApiHarness } from './fixtures/api-harness.fixture.js';
import { sweepProtectedRoutesWithoutToken } from './fixtures/route-sweep.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const HEALTH_PATH = '/v1/health';
const ADMIN_HEALTH_PATH = '/v1/admin/health';
const MONITOR_ADDRESS = '203.0.113.71';
const OTHER_MONITOR_ADDRESS = '203.0.113.72';
const ADMIN_CLAIMS = { realm_access: { roles: ['user', 'admin'] }, acr: '2' };

let harness: ApiHarness;
let productionHarnessRouter: ReturnType<typeof createRouter>;

beforeAll(async () => {
  harness = await createApiHarness();
  const routes = createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true)));
  productionHarnessRouter = createRouter({
    routes,
    verifyAccessToken: () => Promise.reject(new Error('not used')),
    resolveUser: () => Promise.reject(new Error('not used')),
    rateLimiter: createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: 0,
    reportUnexpectedError: () => undefined,
  });
});

afterAll(async () => {
  await harness.stop();
});

function sendToProduction(
  path: string,
  method = 'GET',
  socketAddress = '203.0.113.9',
): Promise<Response> {
  return productionHarnessRouter({
    request: new Request(`http://api.test${path}`, { method }),
    socketAddress,
    traceId: 'trace-health',
  });
}

describe('GET /v1/health', () => {
  test('is public and answers { data: { status: ok } }', async () => {
    const response = await sendToProduction(HEALTH_PATH);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ data: { status: 'ok' } });
  });
});

describe('GET /v1/health under monitoring', () => {
  test('answers a monitor polling far above the generic unauthenticated limit', async () => {
    for (let poll = 0; poll < 200; poll += 1) {
      expect((await sendToProduction(HEALTH_PATH, 'GET', MONITOR_ADDRESS)).status).toBe(200);
    }
  });

  test('is not starved by the unauthenticated bucket of the same address', async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sendToProduction('/v1/me', 'GET', OTHER_MONITOR_ADDRESS);
    }
    expect((await sendToProduction('/v1/me', 'GET', OTHER_MONITOR_ADDRESS)).status).toBe(429);
    expect((await sendToProduction(HEALTH_PATH, 'GET', OTHER_MONITOR_ADDRESS)).status).toBe(200);
  });
});

describe('GET /v1/admin/health', () => {
  const routes = createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true)));

  test('is declared as an admin route', () => {
    const route = routes.find((candidate) => candidate.path === ADMIN_HEALTH_PATH);
    expect(route?.access).toBe(ROUTE_ACCESS.ADMIN);
  });

  test('every non-public production route answers 401 without a token', async () => {
    const outcomes = await sweepProtectedRoutesWithoutToken(routes, (params) =>
      sendToProduction(params.path, params.method),
    );
    expect(outcomes.length).toBeGreaterThanOrEqual(1);
    expect(outcomes.filter((outcome) => outcome.status !== 401)).toStrictEqual([]);
  });
});

describe('admin health through the full authentication pipeline', () => {
  async function adminHealthWith(
    databaseIsUp: boolean,
    claims: Record<string, unknown>,
  ): Promise<Response> {
    const databaseHarness = await createApiHarness();
    try {
      const productionRoutes = createApiRoutes(
        buildApiRouteDependencies(() => Promise.resolve(databaseIsUp)),
      );
      const router = createRouter({
        routes: productionRoutes,
        verifyAccessToken: databaseHarness.verifyAccessToken,
        resolveUser: databaseHarness.resolveUser,
        rateLimiter: createRateLimiter({ now: () => Date.now() }),
        trustedProxyHops: 0,
        reportUnexpectedError: () => undefined,
      });
      const token = await signTestToken({ key: databaseHarness.key, claims });
      return await router({
        request: new Request(`http://api.test${ADMIN_HEALTH_PATH}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        socketAddress: '203.0.113.9',
        traceId: 'trace-admin',
      });
    } finally {
      await databaseHarness.stop();
    }
  }

  test('admin with acr 2 gets the aggregated state', async () => {
    const response = await adminHealthWith(true, ADMIN_CLAIMS);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      data: { status: 'ok', checks: { database: 'up' } },
    });
  });

  test('reports degraded when the database does not answer, with no user data', async () => {
    const response = await adminHealthWith(false, ADMIN_CLAIMS);
    const body = (await response.json()) as {
      data: { status: string; checks: { database: string } };
    };
    expect(body.data).toStrictEqual({ status: 'degraded', checks: { database: 'down' } });
  });

  test('admin without acr 2 gets 403 MFA_REQUIRED', async () => {
    const response = await adminHealthWith(true, { ...ADMIN_CLAIMS, acr: 'password' });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'MFA_REQUIRED',
    );
  });

  test('a plain user gets 403 FORBIDDEN', async () => {
    const response = await adminHealthWith(true, { acr: '2' });
    expect(response.status).toBe(403);
  });
});
