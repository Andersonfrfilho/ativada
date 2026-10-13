// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { StrategyNotFoundError } from '../strategies/strategy.error.js';
import { HORIZONS_PATH } from './horizon.constant.js';
import type { EvaluateHorizonsUseCase } from './horizon-evaluation.use-case.js';
import { createHorizonsQuerySchema } from './horizon-requests.js';
import { toHorizonsView } from './horizon-view.js';
import { HORIZON_DOCUMENTATION } from './horizons.docs.js';

export type HorizonRouteDependencies = {
  readonly enabledSymbols: readonly string[];
  readonly evaluateHorizons: EvaluateHorizonsUseCase;
};

// Id malformado e estratégia inexistente (ou de outro usuário) são o MESMO 404 (ADR 0001 §e).
function readStrategyId(strategyId: string | undefined): string | undefined {
  if (strategyId === undefined) return undefined;
  const parsed = parseResourceId(strategyId);
  if (parsed === undefined) throw new StrategyNotFoundError();
  return parsed;
}

export function createHorizonRoutes(dependencies: HorizonRouteDependencies): readonly Route[] {
  const schema = createHorizonsQuerySchema(dependencies.enabledSymbols);
  return [
    {
      method: HTTP_METHOD.GET,
      path: HORIZONS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,
      documentation: HORIZON_DOCUMENTATION.evaluation,
      handler: async ({ scope, request }): Promise<RouteResult> => {
        const query = readValidatedQuery(request, schema);
        const evaluation = await dependencies.evaluateHorizons(
          scope,
          { symbol: query.symbol, strategyId: readStrategyId(query.strategyId) },
          request.signal,
        );
        return { status: HTTP_STATUS.OK, data: toHorizonsView(evaluation) };
      },
    },
  ];
}
