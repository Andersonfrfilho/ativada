// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_LIVE_STATUS_PATH } from '../runs.constant.js';
import { liveStatusQuerySchema, RUN_LIVE_STATUS_DOCUMENTATION } from './live-status.docs.js';
import type { LiveStatusUseCase } from './live-status.use-case.js';

export function createLiveStatusRoute(liveStatus: LiveStatusUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_LIVE_STATUS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: RUN_LIVE_STATUS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      readValidatedQuery(context.request, liveStatusQuerySchema);
      return { status: HTTP_STATUS.OK, data: await liveStatus(context.scope, runId) };
    },
  };
}
