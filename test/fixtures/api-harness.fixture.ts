// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccessTokenVerifier } from '../../apps/api-crypto/src/authentication/access-token-verifier.js';
import { createRemoteKeyResolver } from '../../apps/api-crypto/src/authentication/remote-key-resolver.js';
import type { UserResolver } from '../../apps/api-crypto/src/authentication/resolve-authenticated-user.js';
import { RATE_LIMIT_POLICY } from '../../apps/api-crypto/src/rate-limit/rate-limit-policy.constant.js';
import { createRateLimiter } from '../../apps/api-crypto/src/rate-limit/rate-limiter.js';
import { createRouter, type Router } from '../../apps/api-crypto/src/router/create-router.js';
import { ROUTE_ACCESS } from '../../apps/api-crypto/src/router/route-access.constant.js';
import type { Route } from '../../apps/api-crypto/src/router/route.types.js';
import { HTTP_METHOD } from '../../apps/api-crypto/src/shared/http/http.constant.js';
import { createOwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../../packages/database/src/ownership/user-id.js';
import { USER_RESOLUTION_STATUS } from '../../packages/database/src/users/user-resolution.constant.js';
import { startJwksTestServer, type JwksTestServer } from './jwks-test-server.fixture.js';
import {
  TEST_AUDIENCE,
  TEST_AUTHORIZED_PARTY,
  TEST_ISSUER,
  createTestSigningKey,
  type TestSigningKey,
} from './token-signing.fixture.js';

export const USER_PATH = '/v1/test/user';
export const ADMIN_PATH = '/v1/admin/test';
export const PUBLIC_PATH = '/v1/test/public';
export const EXECUTION_PATH = '/v1/test/execution';
export const SESSION_PATH = '/v1/test/session';
export const REQUEST_ORIGIN = 'http://harness.test';

export type HarnessOptions = {
  readonly trustedProxyHops?: number;
  readonly deletedSubjects?: readonly string[];
  readonly blockedSubjects?: readonly string[];
  readonly resolverFailure?: Error;
  readonly getKeyOverride?: Parameters<typeof createAccessTokenVerifier>[0]['getKey'];
};

export type SendParams = {
  readonly path: string;
  readonly method?: string;
  readonly token?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly socketAddress?: string;
};

export type ApiHarness = {
  readonly jwks: JwksTestServer;
  readonly key: TestSigningKey;
  readonly router: Router;
  readonly routes: readonly Route[];
  readonly reportedErrors: unknown[];
  readonly resolvedSubjects: string[];
  readonly clock: { advance: (milliseconds: number) => void };
  readonly send: (params: SendParams) => Promise<Response>;
  readonly stop: () => Promise<void>;
};

const TEST_USER_ID_TEXT = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';

function buildTestRoutes(): readonly Route[] {
  const handler = (): Promise<{ status: number; data: unknown }> =>
    Promise.resolve({ status: 200, data: { reached: true } });
  return [
    { method: HTTP_METHOD.GET, path: PUBLIC_PATH, access: ROUTE_ACCESS.PUBLIC, handler },
    { method: HTTP_METHOD.GET, path: USER_PATH, access: ROUTE_ACCESS.USER, handler },
    { method: HTTP_METHOD.POST, path: USER_PATH, access: ROUTE_ACCESS.USER, handler },
    { method: HTTP_METHOD.GET, path: ADMIN_PATH, access: ROUTE_ACCESS.ADMIN, handler },
    {
      method: HTTP_METHOD.POST,
      path: EXECUTION_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.EXECUTION_CREATION,
      handler,
    },
    {
      method: HTTP_METHOD.POST,
      path: SESSION_PATH,
      access: ROUTE_ACCESS.PUBLIC,
      rateLimitPolicy: RATE_LIMIT_POLICY.SESSION_CLIENT_ADDRESS,
      handler,
    },
  ];
}

export async function createApiHarness(options: HarnessOptions = {}): Promise<ApiHarness> {
  const key = await createTestSigningKey('key-1');
  const jwks = startJwksTestServer([key]);
  const resolvedSubjects: string[] = [];
  const reportedErrors: unknown[] = [];
  let nowMilliseconds = Date.now();
  const resolveUser: UserResolver = (subject) => {
    resolvedSubjects.push(subject);
    if (options.resolverFailure !== undefined) return Promise.reject(options.resolverFailure);
    if (options.deletedSubjects?.includes(subject)) {
      return Promise.resolve({ status: USER_RESOLUTION_STATUS.DELETED });
    }
    if (options.blockedSubjects?.includes(subject)) {
      return Promise.resolve({ status: USER_RESOLUTION_STATUS.BLOCKED });
    }
    const userId = userIdFromDatabase(TEST_USER_ID_TEXT);
    return Promise.resolve({
      status: USER_RESOLUTION_STATUS.ACTIVE,
      userId,
      scope: createOwnerScope(userId),
    });
  };
  const routes = buildTestRoutes();
  const router = createRouter({
    routes,
    verifyAccessToken: createAccessTokenVerifier({
      settings: {
        issuer: TEST_ISSUER,
        audience: TEST_AUDIENCE,
        authorizedParties: [TEST_AUTHORIZED_PARTY],
      },
      getKey:
        options.getKeyOverride ??
        createRemoteKeyResolver({
          jwksUrl: jwks.url,
          timeoutMilliseconds: 300,
          cooldownMilliseconds: 50,
        }),
    }),
    resolveUser,
    rateLimiter: createRateLimiter({ now: () => nowMilliseconds }),
    trustedProxyHops: options.trustedProxyHops ?? 0,
    reportUnexpectedError: (error) => reportedErrors.push(error),
  });

  return {
    jwks,
    key,
    router,
    routes,
    reportedErrors,
    resolvedSubjects,
    clock: {
      advance: (milliseconds: number): void => {
        nowMilliseconds += milliseconds;
      },
    },
    send: (params: SendParams): Promise<Response> => {
      const headers = new Headers(params.headers);
      if (params.token !== undefined) headers.set('Authorization', `Bearer ${params.token}`);
      return router({
        request: new Request(`${REQUEST_ORIGIN}${params.path}`, {
          method: params.method ?? HTTP_METHOD.GET,
          headers,
        }),
        socketAddress: params.socketAddress ?? '203.0.113.7',
        traceId: 'trace-test',
      });
    },
    stop: (): Promise<void> => jwks.stop(),
  };
}
