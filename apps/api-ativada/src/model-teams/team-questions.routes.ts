// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { readRunId } from '../runs/run-id.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readTeamKey } from './model-team-key.js';
import {
  RUN_MODEL_TEAM_QUESTIONS_PATH,
  RUN_MODEL_TEAMS_QUESTIONS_PATH,
} from './model-team.constant.js';
import type { AskTeamQuestionUseCase, ListTeamQuestionsUseCase } from './team-question.use-case.js';
import { createTeamQuestionsDocumentation } from './team-questions.docs.js';
import { createTeamQuestionBodySchema, teamQuestionsQuerySchema } from './team-questions.schema.js';

export type TeamQuestionRouteDependencies = {
  readonly enabled: Pick<EnabledMarkets, 'symbols'>;
  readonly askQuestion: AskTeamQuestionUseCase;
  readonly listQuestions: ListTeamQuestionsUseCase;
};

// Perguntar custa uma chamada ao provedor (`MODEL_QUESTION_REQUEST`, 5 por 10 min); a lista é leitura de banco.
export function createTeamQuestionRoutes(
  dependencies: TeamQuestionRouteDependencies,
): readonly Route[] {
  const bodySchema = createTeamQuestionBodySchema(dependencies.enabled);
  const documentation = createTeamQuestionsDocumentation(bodySchema);
  return [
    {
      method: HTTP_METHOD.POST,
      path: RUN_MODEL_TEAM_QUESTIONS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_QUESTION_REQUEST,
      documentation: documentation.ask,
      handler: async (context): Promise<RouteResult> => {
        const runId = readRunId(context);
        const teamKey = readTeamKey(context);
        const body = await readValidatedBody(context.request, bodySchema);
        const data = await dependencies.askQuestion(context.scope, { ...body, runId, teamKey });
        return { status: HTTP_STATUS.ACCEPTED, data };
      },
    },
    {
      method: HTTP_METHOD.GET,
      path: RUN_MODEL_TEAMS_QUESTIONS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_TEAMS_READ,
      documentation: documentation.list,
      handler: async (context): Promise<RouteResult> => {
        const runId = readRunId(context);
        const query = readValidatedQuery(context.request, teamQuestionsQuerySchema);
        return {
          status: HTTP_STATUS.OK,
          data: await dependencies.listQuestions(context.scope, { ...query, runId }),
        };
      },
    },
  ];
}
