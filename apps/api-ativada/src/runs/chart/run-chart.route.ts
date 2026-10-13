// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_CHART_PATH } from '../runs.constant.js';
import { RUN_CHART_DOCUMENTATION } from './run-chart.docs.js';
import { chartQuerySchema } from './run-chart.schema.js';
import type { RunChartUseCase } from './run-chart.use-case.js';

export function createRunChartRoute(chart: RunChartUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_CHART_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_CHART,
    documentation: RUN_CHART_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const query = readValidatedQuery(context.request, chartQuerySchema);
      return { status: HTTP_STATUS.OK, data: await chart(context.scope, runId, query) };
    },
  };
}
