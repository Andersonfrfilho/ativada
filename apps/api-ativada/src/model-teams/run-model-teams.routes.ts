// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { readRunId } from '../runs/run-id.js';
import { decodeTimeCursor } from '../runs/run-cursor.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { invalidCursorError } from '../shared/pagination/page-query.schema.js';
import { readTeamKey } from './model-team-key.js';
import { RUN_MODEL_TEAM_OPINIONS_PATH, RUN_MODEL_TEAMS_PATH } from './model-team.constant.js';
import type { ModelOpinionRequestUseCase } from './model-opinion-request.use-case.js';
import { RUN_MODEL_TEAMS_DOCUMENTATION } from './run-model-teams.docs.js';
import type { RunModelTeamsComparisonUseCase } from './run-model-teams-comparison.use-case.js';
import { comparisonQuerySchema } from './run-model-teams-comparison.schema.js';
import { runModelTeamsQuerySchema } from './run-model-teams.schema.js';
import type { RunModelTeamsUseCase } from './run-model-teams.use-case.js';

const COMPARISON_PATH = `${RUN_MODEL_TEAMS_PATH}/comparison`;

export type RunModelTeamsRouteDependencies = {
  readonly runModelTeams: RunModelTeamsUseCase;
  readonly comparison: RunModelTeamsComparisonUseCase;
  readonly requestOpinion: ModelOpinionRequestUseCase;
};

function createStateRoute(dependencies: RunModelTeamsRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_MODEL_TEAMS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_TEAMS_READ,
    documentation: RUN_MODEL_TEAMS_DOCUMENTATION.state,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const query = readValidatedQuery(context.request, runModelTeamsQuerySchema);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.runModelTeams(context.scope, runId, query),
      };
    },
  };
}

function createComparisonRoute(dependencies: RunModelTeamsRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: COMPARISON_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_TEAMS_READ,
    documentation: RUN_MODEL_TEAMS_DOCUMENTATION.comparison,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const query = readValidatedQuery(context.request, comparisonQuerySchema);
      const before = query.cursor === undefined ? undefined : decodeTimeCursor(query.cursor);
      if (query.cursor !== undefined && before === undefined) throw invalidCursorError();
      const page = await dependencies.comparison(context.scope, runId, { before, query });
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

function createOpinionRoute(dependencies: RunModelTeamsRouteDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: RUN_MODEL_TEAM_OPINIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_OPINION_REQUEST,
    documentation: RUN_MODEL_TEAMS_DOCUMENTATION.opinion,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const teamKey = readTeamKey(context);
      const data = await dependencies.requestOpinion(context.scope, { runId, teamKey });
      return { status: HTTP_STATUS.ACCEPTED, data };
    },
  };
}

export function createRunModelTeamsRoutes(
  dependencies: RunModelTeamsRouteDependencies,
): readonly Route[] {
  return [
    createStateRoute(dependencies),
    createComparisonRoute(dependencies),
    createOpinionRoute(dependencies),
  ];
}
