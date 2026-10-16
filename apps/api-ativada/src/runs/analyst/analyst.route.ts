// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readDecisionsInput } from '../live-status/run-decisions.route.js';
import { readRunId } from '../run-id.js';
import { RUN_ANALYST_DECISIONS_PATH, RUN_ANALYST_PATH } from '../runs.constant.js';
import type { AnalystDecisionsUseCase } from './analyst-decisions.use-case.js';
import {
  analystQuerySchema,
  RUN_ANALYST_DECISIONS_DOCUMENTATION,
  RUN_ANALYST_DOCUMENTATION,
} from './analyst.docs.js';
import type { AnalystUseCase } from './analyst.use-case.js';

export function createAnalystRoute(analyst: AnalystUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_ANALYST_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: RUN_ANALYST_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      readValidatedQuery(context.request, analystQuerySchema);
      return { status: HTTP_STATUS.OK, data: await analyst(context.scope, runId) };
    },
  };
}

export function createAnalystDecisionsRoute(decisions: AnalystDecisionsUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_ANALYST_DECISIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: RUN_ANALYST_DECISIONS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const page = await decisions(context.scope, runId, readDecisionsInput(context.request));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}
