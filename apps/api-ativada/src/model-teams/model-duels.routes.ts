// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { DUEL_ID_PARAM, MODEL_DUEL_PATH, MODEL_DUELS_PATH } from './model-team.constant.js';
import { DuelNotFoundError } from './model-team.error.js';
import type { ModelDuelCreateUseCase } from './model-duel-create.use-case.js';
import { MODEL_DUEL_DOCUMENTATION } from './model-duels.docs.js';
import type { ModelDuelReadUseCase } from './model-duel-read.use-case.js';
import { createModelDuelBodySchema } from './model-duel.schema.js';

export type ModelDuelRouteDependencies = {
  readonly enabled: EnabledMarkets;
  readonly createDuel: ModelDuelCreateUseCase;
  readonly readDuel: ModelDuelReadUseCase;
};

// Id malformado no caminho é o mesmo 404 do duelo que não existe.
function readDuelId(context: ProtectedRouteContext): string {
  const duelId = parseResourceId(context.pathParams[DUEL_ID_PARAM]);
  if (duelId === undefined) throw new DuelNotFoundError();
  return duelId;
}

export function createModelDuelRoutes(dependencies: ModelDuelRouteDependencies): readonly Route[] {
  const bodySchema = createModelDuelBodySchema(dependencies.enabled);
  return [
    {
      method: HTTP_METHOD.POST,
      path: MODEL_DUELS_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_DUEL_CREATE,
      documentation: { ...MODEL_DUEL_DOCUMENTATION.create, body: bodySchema },
      handler: async ({ scope, request }): Promise<RouteResult> => ({
        status: HTTP_STATUS.CREATED,
        data: await dependencies.createDuel(scope, await readValidatedBody(request, bodySchema)),
      }),
    },
    {
      method: HTTP_METHOD.GET,
      path: MODEL_DUEL_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.MODEL_TEAMS_READ,
      documentation: MODEL_DUEL_DOCUMENTATION.get,
      handler: async (context): Promise<RouteResult> => ({
        status: HTTP_STATUS.OK,
        data: await dependencies.readDuel(context.scope, readDuelId(context)),
      }),
    },
  ];
}
