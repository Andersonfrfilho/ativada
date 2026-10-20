// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_TRADE_PLAN_PATH } from '../runs.constant.js';
import { RUN_TRADE_PLAN_DOCUMENTATION, tradePlanQuerySchema } from './trade-plan.docs.js';
import type { TradePlanUseCase } from './trade-plan.use-case.js';

// Rota irmã do `live-status`, no MESMO balde de 60 por minuto (`RUN_LIVE_STATUS`): o aviso do stream refaz as duas.
export function createTradePlanRoute(tradePlan: TradePlanUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_TRADE_PLAN_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: RUN_TRADE_PLAN_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      readValidatedQuery(context.request, tradePlanQuerySchema);
      return { status: HTTP_STATUS.OK, data: await tradePlan(context.scope, runId) };
    },
  };
}
