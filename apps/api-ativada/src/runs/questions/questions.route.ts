// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EnabledMarkets } from '../../markets/candles-query.schema.js';
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { readRunId } from '../run-id.js';
import { RUN_QUESTIONS_PATH } from '../runs.constant.js';
import { createQuestionsDocumentation } from './questions.docs.js';
import { createQuestionsQuerySchema } from './questions.schema.js';
import type { QuestionsUseCase } from './questions.use-case.js';

export type QuestionsRouteDependencies = {
  readonly questions: QuestionsUseCase;
  readonly enabled: Pick<EnabledMarkets, 'symbols'>;
};

// Balde próprio (`RUN_QUESTION`, 20 por minuto): cada pergunta pode ler 500 velas e refazer as leituras do placar.
export function createQuestionsRoute(dependencies: QuestionsRouteDependencies): Route {
  const querySchema = createQuestionsQuerySchema(dependencies.enabled);
  return {
    method: HTTP_METHOD.GET,
    path: RUN_QUESTIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_QUESTION,
    documentation: createQuestionsDocumentation(querySchema),
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const query = readValidatedQuery(context.request, querySchema);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.questions(context.scope, runId, query),
      };
    },
  };
}
