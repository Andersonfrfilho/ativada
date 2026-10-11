// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ROUTE_ACCESS } from '../apps/api-cryptoada/src/router/route-access.constant.js';
import { createApiRoutes } from '../apps/api-cryptoada/src/routes/create-api-routes.js';
import type { Route } from '../apps/api-cryptoada/src/router/route.types.js';
import { callAdmin, collectKeys } from './fixtures/admin-calls.fixture.js';
import { ADMIN_PATH } from './fixtures/api-harness.fixture.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';
import {
  MEMBER_ID,
  MEMBER_SUBJECT,
  OTHER_MEMBER_ID,
  createAdminHarness,
  type AdminHarness,
} from './fixtures/admin-harness.fixture.js';

const ALLOWED_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'blockedAt',
  'deletedAt',
  'email',
  'isResend',
  'accountId',
  'isBlocked',
  'isIdentityProviderSynced',
  'nextCursor',
  'listener',
  'state',
  'reason',
  'perPage',
  'status',
  'checks',
  'database',
  'runs',
  'queued',
  'running',
  'byKind',
  'backtest',
  'walk_forward',
  'live_paper',
  'data',
  'pagination',
]);
const USER_DATA_WORDS =
  /strateg|wallet|carteira|portfolio|alert|asset|ativo|\brun|simula|execu|order|ordem|signal|sinal|goal|meta|telegram|chat|displayName|limits|timezone|currency/i;

let harness: AdminHarness;

beforeAll(async () => {
  harness = await createAdminHarness();
});

afterAll(async () => {
  await harness.stop();
});

function adminRoutes(): readonly Route[] {
  return harness.api.routes.filter(
    (route) => route.path.startsWith('/v1/admin/') && route.path !== ADMIN_PATH,
  );
}

function concretePath(route: Route): string {
  return route.path.replace(':accountId', OTHER_MEMBER_ID);
}

function bodyFor(route: Route): unknown {
  return route.path.endsWith('/invitations') ? { email: 'varredura@example.test' } : undefined;
}

describe('the admin surface never carries user data', () => {
  test('the sweep covers every admin route', () => {
    expect(adminRoutes().length).toBeGreaterThanOrEqual(5);
    expect(adminRoutes().every((route) => route.access === ROUTE_ACCESS.ADMIN)).toBe(true);
  });

  test('the harness covers exactly the admin routes the application registers', () => {
    const registered = createApiRoutes(buildApiRouteDependencies(() => Promise.resolve(true)))
      .filter((route) => route.path.startsWith('/v1/admin/'))
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    const swept = adminRoutes()
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    expect(swept).toStrictEqual(registered);
  });

  test('no admin route path names a user resource', () => {
    for (const route of adminRoutes()) expect(route.path).not.toMatch(USER_DATA_WORDS);
  });

  test('every admin route answers only fields from the allowed list', async () => {
    for (const route of adminRoutes()) {
      const body = bodyFor(route);
      const response = await callAdmin(harness, {
        path: concretePath(route),
        method: route.method,
        ...(body === undefined ? {} : { body }),
      });
      const text = await response.text();
      expect({ route: route.path, status: response.status < 500 }).toStrictEqual({
        route: route.path,
        status: true,
      });
      if (text.length === 0) continue;
      for (const key of collectKeys(JSON.parse(text) as unknown)) {
        expect({ route: route.path, key, allowed: ALLOWED_RESPONSE_FIELDS.has(key) }).toStrictEqual(
          {
            route: route.path,
            key,
            allowed: true,
          },
        );
      }
      expect(text).not.toMatch(/telegram|chat|displayName|strateg|wallet/i);
    }
  });

  test('an administrator token cannot read the profile data of another user through /v1/me', async () => {
    const response = await callAdmin(harness, { path: '/v1/me', subject: MEMBER_SUBJECT });
    const body = (await response.json()) as { data: { id: string } };
    expect(body.data.id).toBe(MEMBER_ID);
  });
});
