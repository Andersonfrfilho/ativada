// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { SENTIMENT_PATH } from './sentiment.constant.js';
import { SENTIMENT_DOCUMENTATION } from './sentiment.docs.js';
import type { GetSentimentUseCase } from './sentiment.use-case.js';

export type SentimentRouteDependencies = { readonly getSentiment: GetSentimentUseCase };

export function createSentimentRoutes(dependencies: SentimentRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: SENTIMENT_PATH,
      access: ROUTE_ACCESS.USER,
      documentation: SENTIMENT_DOCUMENTATION,
      handler: async (): Promise<RouteResult> => ({
        status: HTTP_STATUS.OK,
        data: await dependencies.getSentiment(),
      }),
    },
  ];
}
