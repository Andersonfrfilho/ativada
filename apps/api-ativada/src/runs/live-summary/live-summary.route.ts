// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { RUN_LIVE_SUMMARY_PATH } from '../runs.constant.js';
import { liveSummaryQuerySchema, RUN_LIVE_SUMMARY_DOCUMENTATION } from './live-summary.docs.js';
import type { LiveSummaryUseCase } from './live-summary.use-case.js';

export function createLiveSummaryRoute(liveSummary: LiveSummaryUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_LIVE_SUMMARY_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_SUMMARY,
    documentation: RUN_LIVE_SUMMARY_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      readValidatedQuery(context.request, liveSummaryQuerySchema);
      return { status: HTTP_STATUS.OK, data: await liveSummary(context.scope) };
    },
  };
}
