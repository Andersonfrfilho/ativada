// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readPage } from '../shared/pagination/read-page.js';
import { decodeGoalCursor } from './goal-cursor.js';
import { createGoalSchema, patchGoalSchema } from './goal-requests.js';
import { z } from '@ativada/environment';

import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import {
  GOAL_EVALUATION_PATH,
  GOAL_ID_PARAM,
  GOAL_PATH,
  GOAL_PLAN_PATH,
  GOALS_PATH,
} from './goal.constant.js';
import type { GetGoalPlanUseCase } from './goal-plan.use-case.js';
import { GoalNotFoundError } from './goal.error.js';
import type { EvaluateGoalUseCase } from './goal-evaluation.use-case.js';
import type {
  CreateGoalUseCase,
  DeleteGoalUseCase,
  GetGoalUseCase,
  ListGoalsUseCase,
  UpdateGoalUseCase,
} from './goal.use-cases.js';
import { GOAL_PLAN_DOCUMENTATION } from './goal-plan.docs.js';
import { GOAL_DOCUMENTATION } from './goals.docs.js';

export type GoalRouteDependencies = {
  readonly enabledSymbols: readonly string[];
  readonly createGoal: CreateGoalUseCase;
  readonly listGoals: ListGoalsUseCase;
  readonly getGoal: GetGoalUseCase;
  readonly updateGoal: UpdateGoalUseCase;
  readonly deleteGoal: DeleteGoalUseCase;
  readonly evaluateGoal: EvaluateGoalUseCase;
  readonly getGoalPlan: GetGoalPlanUseCase;
};

const PLAN_QUERY_SCHEMA = z.strictObject({ strategyId: z.uuid() });

// UUID malformado e meta inexistente são o MESMO 404 (ADR 0001 §e).
function readGoalId(context: ProtectedRouteContext): string {
  const goalId = parseResourceId(context.pathParams[GOAL_ID_PARAM]);
  if (goalId === undefined) throw new GoalNotFoundError();
  return goalId;
}

function createListRoute(dependencies: GoalRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: GOALS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: GOAL_DOCUMENTATION.list,
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const page = await dependencies.listGoals(scope, readPage(request, decodeGoalCursor));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

function createCreateRoute(dependencies: GoalRouteDependencies): Route {
  const schema = createGoalSchema(dependencies.enabledSymbols);
  return {
    method: HTTP_METHOD.POST,
    path: GOALS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: GOAL_DOCUMENTATION.create,
    handler: async ({ scope, request }): Promise<RouteResult> => ({
      status: HTTP_STATUS.CREATED,
      data: await dependencies.createGoal(scope, await readValidatedBody(request, schema)),
    }),
  };
}

function createGetRoute(dependencies: GoalRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: GOAL_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: GOAL_DOCUMENTATION.get,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getGoal(context.scope, readGoalId(context)),
    }),
  };
}

function createUpdateRoute(dependencies: GoalRouteDependencies): Route {
  const schema = patchGoalSchema(dependencies.enabledSymbols);
  return {
    method: HTTP_METHOD.PATCH,
    path: GOAL_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: GOAL_DOCUMENTATION.update,
    handler: async (context): Promise<RouteResult> => {
      const goalId = readGoalId(context);
      const patch = await readValidatedBody(context.request, schema);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.updateGoal(context.scope, { goalId, patch }),
      };
    },
  };
}

function createDeleteRoute(dependencies: GoalRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: GOAL_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: GOAL_DOCUMENTATION.delete,
    handler: async (context): Promise<RouteResult> => {
      await dependencies.deleteGoal(context.scope, readGoalId(context));
      return { status: HTTP_STATUS.NO_CONTENT };
    },
  };
}

function createEvaluationRoute(dependencies: GoalRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: GOAL_EVALUATION_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,
    documentation: GOAL_DOCUMENTATION.evaluation,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.evaluateGoal(
        context.scope,
        readGoalId(context),
        context.request.signal,
      ),
    }),
  };
}

function createPlanRoute(dependencies: GoalRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: GOAL_PLAN_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,
    documentation: GOAL_PLAN_DOCUMENTATION.plan,
    handler: async (context): Promise<RouteResult> => {
      const goalId = readGoalId(context);
      const { strategyId } = readValidatedQuery(context.request, PLAN_QUERY_SCHEMA);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.getGoalPlan(context.scope, { goalId, strategyId }),
      };
    },
  };
}

export function createGoalRoutes(dependencies: GoalRouteDependencies): readonly Route[] {
  return [
    createListRoute(dependencies),
    createCreateRoute(dependencies),
    createGetRoute(dependencies),
    createUpdateRoute(dependencies),
    createDeleteRoute(dependencies),
    createEvaluationRoute(dependencies),
    createPlanRoute(dependencies),
  ];
}
