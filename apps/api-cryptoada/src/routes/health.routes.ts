// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';

export const HEALTH_PATH = '/v1/health';
export const ADMIN_HEALTH_PATH = '/v1/admin/health';

const HEALTH_STATUS = { OK: 'ok', DEGRADED: 'degraded' } as const;
const DEPENDENCY_STATE = { UP: 'up', DOWN: 'down' } as const;

export type HealthRouteDependencies = {
  readonly checkDatabase: () => Promise<boolean>;
};

export function createHealthRoutes(dependencies: HealthRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: HEALTH_PATH,
      access: ROUTE_ACCESS.PUBLIC,
      rateLimitPolicy: RATE_LIMIT_POLICY.HEALTH_CLIENT_ADDRESS,
      handler: () =>
        Promise.resolve({ status: HTTP_STATUS.OK, data: { status: HEALTH_STATUS.OK } }),
    },
    {
      method: HTTP_METHOD.GET,
      path: ADMIN_HEALTH_PATH,
      access: ROUTE_ACCESS.ADMIN,
      handler: async (): Promise<RouteResult> => {
        const isDatabaseUp = await dependencies.checkDatabase();
        return {
          status: HTTP_STATUS.OK,
          data: {
            status: isDatabaseUp ? HEALTH_STATUS.OK : HEALTH_STATUS.DEGRADED,
            checks: { database: isDatabaseUp ? DEPENDENCY_STATE.UP : DEPENDENCY_STATE.DOWN },
          },
        };
      },
    },
  ];
}
