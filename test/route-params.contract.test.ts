// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { RouteDeclarationError } from '../apps/api-ativada/src/router/route-declaration.error.js';
import { ROUTE_ACCESS } from '../apps/api-ativada/src/router/route-access.constant.js';
import { ROUTE_LOOKUP_KIND, createRouteTable } from '../apps/api-ativada/src/router/route-table.js';
import type { Route } from '../apps/api-ativada/src/router/route.types.js';
import { HTTP_METHOD } from '../apps/api-ativada/src/shared/http/http.constant.js';

const handler = (): Promise<{ status: number }> => Promise.resolve({ status: 200 });

const routes: readonly Route[] = [
  { method: HTTP_METHOD.GET, path: '/v1/admin/accounts', access: ROUTE_ACCESS.ADMIN, handler },
  {
    method: HTTP_METHOD.POST,
    path: '/v1/admin/accounts/:accountId/block',
    access: ROUTE_ACCESS.ADMIN,
    handler,
  },
  {
    method: HTTP_METHOD.DELETE,
    path: '/v1/admin/accounts/:accountId/block',
    access: ROUTE_ACCESS.ADMIN,
    handler,
  },
];

describe('route table with path parameters', () => {
  const table = createRouteTable(routes);

  test('captures the parameter value and keeps static routes untouched', () => {
    const lookup = table.find('POST', '/v1/admin/accounts/abc-123/block');
    expect(lookup).toMatchObject({
      kind: ROUTE_LOOKUP_KIND.FOUND,
      pathParams: { accountId: 'abc-123' },
    });
    expect(table.find('GET', '/v1/admin/accounts')).toMatchObject({
      kind: ROUTE_LOOKUP_KIND.FOUND,
      pathParams: {},
    });
  });

  test('does not match an empty value, extra segments or a different literal', () => {
    for (const path of [
      '/v1/admin/accounts//block',
      '/v1/admin/accounts/abc/block/extra',
      '/v1/admin/accounts/abc/unblock',
      '/v1/admin/accounts/abc',
    ]) {
      expect({ path, kind: table.find('POST', path).kind }).toStrictEqual({
        path,
        kind: ROUTE_LOOKUP_KIND.NOT_FOUND,
      });
    }
  });

  test('answers method not allowed with every method of the pattern', () => {
    const lookup = table.find('GET', '/v1/admin/accounts/abc/block');
    expect(lookup).toStrictEqual({
      kind: ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED,
      allowedMethods: ['POST', 'DELETE'],
    });
  });

  test('rejects the same pattern declared twice', () => {
    expect(() => createRouteTable([...routes, routes[1] as Route])).toThrow(RouteDeclarationError);
  });

  test('a pattern under /v1/admin still has to declare admin access', () => {
    const publicPattern: Route = {
      method: HTTP_METHOD.GET,
      path: '/v1/admin/accounts/:accountId/x',
      access: ROUTE_ACCESS.PUBLIC,
      handler,
    };
    expect(() => createRouteTable([publicPattern])).toThrow(RouteDeclarationError);
  });
});
