// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { RouteDeclarationError } from '../apps/api-cryptoada/src/router/route-declaration.error.js';
import { ROUTE_ACCESS } from '../apps/api-cryptoada/src/router/route-access.constant.js';
import { createRateLimiter } from '../apps/api-cryptoada/src/rate-limit/rate-limiter.js';
import { createRouter } from '../apps/api-cryptoada/src/router/create-router.js';
import { createRouteTable } from '../apps/api-cryptoada/src/router/route-table.js';
import type { Route } from '../apps/api-cryptoada/src/router/route.types.js';
import { HTTP_METHOD } from '../apps/api-cryptoada/src/shared/http/http.constant.js';
import { ROUTING_ERROR_CODE } from '../apps/api-cryptoada/src/shared/errors/error-code.constant.js';
import { createApiHarness, type ApiHarness } from './fixtures/api-harness.fixture.js';
import { sweepProtectedRoutesWithoutToken } from './fixtures/route-sweep.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const handler = (): Promise<{ status: number; data: unknown }> =>
  Promise.resolve({ status: 200, data: {} });

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.stop();
});

describe('router denies by default', () => {
  test('every non-public route answers 401 without a token', async () => {
    const outcomes = await sweepProtectedRoutesWithoutToken(harness.routes, harness.send);
    expect(outcomes.length).toBeGreaterThanOrEqual(4);
    expect(outcomes.filter((outcome) => outcome.status !== 401)).toStrictEqual([]);
  });

  test('public routes answer without a token', async () => {
    expect((await harness.send({ path: '/v1/test/public' })).status).toBe(200);
  });

  test('an unknown path answers 404 ROUTE_NOT_FOUND in the standard envelope', async () => {
    const response = await harness.send({ path: '/v1/does/not/exist' });
    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      error: { code: ROUTING_ERROR_CODE.ROUTE_NOT_FOUND, message: 'Rota não encontrada.' },
    });
  });

  test('a wrong method answers 405 METHOD_NOT_ALLOWED with the Allow header', async () => {
    const response = await harness.send({ path: '/v1/test/user', method: 'DELETE' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, POST');
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      ROUTING_ERROR_CODE.METHOD_NOT_ALLOWED,
    );
  });

  test('a path with a trailing slash is not the same route', async () => {
    expect((await harness.send({ path: '/v1/test/user/' })).status).toBe(404);
  });
});

describe('route declaration', () => {
  test('a route without access does not register', () => {
    const undeclared = { method: HTTP_METHOD.GET, path: '/v1/x', handler } as unknown as Route;
    expect(() => createRouteTable([undeclared])).toThrow(RouteDeclarationError);
  });

  test('a route with an unknown access value does not register', () => {
    const invalid = {
      method: 'GET',
      path: '/v1/x',
      access: 'everyone',
      handler,
    } as unknown as Route;
    expect(() => createRouteTable([invalid])).toThrow(RouteDeclarationError);
  });

  test('a duplicated method and path does not register', () => {
    const route: Route = {
      method: HTTP_METHOD.GET,
      path: '/v1/x',
      access: ROUTE_ACCESS.PUBLIC,
      handler,
    };
    expect(() => createRouteTable([route, route])).toThrow(RouteDeclarationError);
  });

  test('a /v1/admin path declared as user does not register', () => {
    const route: Route = {
      method: HTTP_METHOD.GET,
      path: '/v1/admin/accounts',
      access: ROUTE_ACCESS.USER,
      handler,
    };
    expect(() => createRouteTable([route])).toThrow(RouteDeclarationError);
  });
});

describe('global exception filter', () => {
  test('an unexpected error becomes a generic 500 and is reported with the trace id', async () => {
    const failingHarness = await createApiHarness();
    try {
      const failure = new Error('database password is hunter2');
      const failingRoute: Route = {
        method: HTTP_METHOD.GET,
        path: '/v1/test/boom',
        access: ROUTE_ACCESS.PUBLIC,
        handler: () => Promise.reject(failure),
      };
      const router = createRouter({
        routes: [failingRoute],
        verifyAccessToken: () => Promise.reject(failure),
        resolveUser: () => Promise.reject(failure),
        rateLimiter: createRateLimiter({ now: () => 0 }),
        trustedProxyHops: 0,
        reportUnexpectedError: (error, traceId) =>
          failingHarness.reportedErrors.push([error, traceId]),
      });
      const response = await router({
        request: new Request('http://harness.test/v1/test/boom'),
        socketAddress: '203.0.113.7',
        traceId: 'trace-boom',
      });
      const text = await response.text();
      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toStrictEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente em instantes.' },
      });
      expect(text).not.toContain('hunter2');
      expect(failingHarness.reportedErrors).toStrictEqual([[failure, 'trace-boom']]);
    } finally {
      await failingHarness.stop();
    }
  });

  test('a failure while resolving the user is a generic 500 reported once', async () => {
    const failure = new Error('connection refused at 10.0.0.5:5432');
    const failingHarness = await createApiHarness({ resolverFailure: failure });
    try {
      const token = await signTestToken({ key: failingHarness.key });
      const response = await failingHarness.send({ path: '/v1/test/user', token });
      const text = await response.text();
      expect(response.status).toBe(500);
      expect(text).not.toContain('10.0.0.5');
      expect(failingHarness.reportedErrors).toStrictEqual([failure]);
    } finally {
      await failingHarness.stop();
    }
  });
});
