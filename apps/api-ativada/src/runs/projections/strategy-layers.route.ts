// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_STRATEGY_LAYERS_PATH } from '../runs.constant.js';
import { STRATEGY_LAYERS_DOCUMENTATION } from './strategy-layers.docs.js';
import { strategyLayersQuerySchema } from './strategy-layers.schema.js';
import type { StrategyLayersUseCase } from './strategy-layers.use-case.js';

export function createStrategyLayersRoute(layers: StrategyLayersUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_STRATEGY_LAYERS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_CHART,
    documentation: STRATEGY_LAYERS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const query = readValidatedQuery(context.request, strategyLayersQuerySchema);
      return { status: HTTP_STATUS.OK, data: await layers(context.scope, runId, query) };
    },
  };
}
