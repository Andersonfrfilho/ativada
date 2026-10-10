// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunQueueSummary } from '@cryptoada/database';

import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { LISTENER_STATE, type ListenerHealth } from '../stream/listener-health.js';
import { HEALTH_DOCUMENTATION } from './health.docs.js';

export const HEALTH_PATH = '/v1/health';
export const ADMIN_HEALTH_PATH = '/v1/admin/health';

const HEALTH_STATUS = { OK: 'ok', DEGRADED: 'degraded' } as const;
const DEPENDENCY_STATE = { UP: 'up', DOWN: 'down' } as const;

export type HealthRouteDependencies = {
  readonly checkDatabase: () => Promise<boolean>;
  // Contagens AGREGADAS da fila de execuções (por estado e tipo): nenhum dado de usuário.
  readonly readRunQueueSummary: () => Promise<RunQueueSummary>;
  readonly readListenerHealth: () => ListenerHealth;
};

async function readRuns(dependencies: HealthRouteDependencies): Promise<RunQueueSummary | null> {
  try {
    return await dependencies.readRunQueueSummary();
  } catch {
    return null;
  }
}

export function createHealthRoutes(dependencies: HealthRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: HEALTH_PATH,
      access: ROUTE_ACCESS.PUBLIC,
      rateLimitPolicy: RATE_LIMIT_POLICY.HEALTH_CLIENT_ADDRESS,
      documentation: HEALTH_DOCUMENTATION.health,
      handler: () =>
        Promise.resolve({ status: HTTP_STATUS.OK, data: { status: HEALTH_STATUS.OK } }),
    },
    {
      method: HTTP_METHOD.GET,
      path: ADMIN_HEALTH_PATH,
      access: ROUTE_ACCESS.ADMIN,
      documentation: HEALTH_DOCUMENTATION.adminHealth,
      handler: async (): Promise<RouteResult> => {
        const isDatabaseUp = await dependencies.checkDatabase();
        const listener = dependencies.readListenerHealth();
        const isHealthy = isDatabaseUp && listener.state !== LISTENER_STATE.FAILED;
        return {
          status: HTTP_STATUS.OK,
          data: {
            status: isHealthy ? HEALTH_STATUS.OK : HEALTH_STATUS.DEGRADED,
            checks: { database: isDatabaseUp ? DEPENDENCY_STATE.UP : DEPENDENCY_STATE.DOWN },
            listener,
            runs: isDatabaseUp ? await readRuns(dependencies) : null,
          },
        };
      },
    },
  ];
}
