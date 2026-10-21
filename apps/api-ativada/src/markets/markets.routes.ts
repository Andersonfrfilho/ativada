// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readRetentionMeta, type DisplayRetention } from './display-retention.js';
import { createCandlesQuerySchema, type EnabledMarkets } from './candles-query.schema.js';
import { CANDLES_PATH } from './markets.constant.js';
import { createMarketDocumentation } from './markets.docs.js';
import type { ListCandlesUseCase } from './list-candles.use-case.js';

export type MarketRouteDependencies = {
  readonly enabled: EnabledMarkets;
  readonly listCandles: ListCandlesUseCase;
  // Retenção das velas de exibição (spec 017): presente, a resposta dessas velas leva `meta.retentionStart`.
  readonly displayRetention?: DisplayRetention | undefined;
};

export function createMarketRoutes(dependencies: MarketRouteDependencies): readonly Route[] {
  const querySchema = createCandlesQuerySchema(dependencies.enabled);
  return [
    {
      method: HTTP_METHOD.GET,
      path: CANDLES_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.CANDLE_QUERY,
      documentation: createMarketDocumentation(querySchema),
      handler: async ({ request }): Promise<RouteResult> => {
        const query = readValidatedQuery(request, querySchema);
        const meta = readRetentionMeta(query.timeframe, dependencies.displayRetention);
        return {
          status: HTTP_STATUS.OK,
          data: await dependencies.listCandles(query),
          ...(meta === undefined ? {} : { meta }),
        };
      },
    },
  ];
}
