// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_TRADE_SUMMARY_PATH } from '../runs.constant.js';
import { RUN_TRADE_SUMMARY_DOCUMENTATION, tradeSummaryQuerySchema } from './trade-summary.docs.js';
import type { TradeSummaryUseCase } from './trade-summary.use-case.js';

export function createTradeSummaryRoute(tradeSummary: TradeSummaryUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_TRADE_SUMMARY_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_TRADE_SUMMARY,
    documentation: RUN_TRADE_SUMMARY_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      readValidatedQuery(context.request, tradeSummaryQuerySchema);
      return { status: HTTP_STATUS.OK, data: await tradeSummary(context.scope, runId) };
    },
  };
}
