// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../../apps/api-crypto/src/router/route-access.constant.js';
import type { Route } from '../../apps/api-crypto/src/router/route.types.js';
import type { SendParams } from './api-harness.fixture.js';

export type SweepOutcome = {
  readonly route: string;
  readonly status: number;
};

export async function sweepProtectedRoutesWithoutToken(
  routes: readonly Route[],
  send: (params: SendParams) => Promise<Response>,
): Promise<readonly SweepOutcome[]> {
  const protectedRoutes = routes.filter((route) => route.access !== ROUTE_ACCESS.PUBLIC);
  return Promise.all(
    protectedRoutes.map(async (route) => {
      const response = await send({ path: route.path, method: route.method });
      return { route: `${route.method} ${route.path}`, status: response.status };
    }),
  );
}
