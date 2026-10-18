// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import type { ListMyModelTeamsUseCase, SetMyModelTeamUseCase } from './me-model-teams.use-case.js';
import {
  emptyQuerySchema,
  MY_MODEL_TEAMS_DOCUMENTATION,
  updateMyModelTeamSchema,
} from './me-model-teams.docs.js';
import { readTeamKey } from './model-team-key.js';
import { ME_MODEL_TEAM_PATH, ME_MODEL_TEAMS_PATH } from './model-team.constant.js';

export type MyModelTeamsRouteDependencies = {
  readonly listMyModelTeams: ListMyModelTeamsUseCase;
  readonly setMyModelTeam: SetMyModelTeamUseCase;
};

export function createMyModelTeamsRoutes(
  dependencies: MyModelTeamsRouteDependencies,
): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: ME_MODEL_TEAMS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_TEAMS_READ,
      documentation: MY_MODEL_TEAMS_DOCUMENTATION.list,
      handler: async ({ scope, request }): Promise<RouteResult> => {
        readValidatedQuery(request, emptyQuerySchema);
        return { status: HTTP_STATUS.OK, data: await dependencies.listMyModelTeams(scope) };
      },
    },
    {
      method: HTTP_METHOD.PATCH,
      path: ME_MODEL_TEAM_PATH,
      access: ROUTE_ACCESS.USER,
      documentation: MY_MODEL_TEAMS_DOCUMENTATION.update,
      handler: async (context): Promise<RouteResult> => {
        const teamKey = readTeamKey(context);
        const body = await readValidatedBody(context.request, updateMyModelTeamSchema);
        const data = await dependencies.setMyModelTeam(context.scope, {
          teamKey,
          isEnabled: body.enabled,
        });
        return { status: HTTP_STATUS.OK, data };
      },
    },
  ];
}
