// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readPage } from '../shared/pagination/read-page.js';
import { STRATEGY_DOCUMENTATION } from './strategies.docs.js';
import { decodeStrategyCursor, decodeVersionCursor } from './strategy-cursor.js';
import { addVersionSchema, createStrategySchema } from './strategy-requests.js';
import {
  STRATEGIES_PATH,
  STRATEGY_ID_PARAM,
  STRATEGY_PATH,
  STRATEGY_VERSIONS_PATH,
} from './strategy.constant.js';
import { StrategyNotFoundError } from './strategy.error.js';
import type {
  AddVersionUseCase,
  CreateStrategyUseCase,
  DeleteStrategyUseCase,
  GetStrategyUseCase,
  ListStrategiesUseCase,
  ListVersionsUseCase,
  PageOutput,
} from './strategy.use-cases.js';

export type StrategyRouteDependencies = {
  readonly createStrategy: CreateStrategyUseCase;
  readonly listStrategies: ListStrategiesUseCase;
  readonly getStrategy: GetStrategyUseCase;
  readonly listVersions: ListVersionsUseCase;
  readonly addVersion: AddVersionUseCase;
  readonly deleteStrategy: DeleteStrategyUseCase;
};

function readStrategyId(context: ProtectedRouteContext): string {
  const strategyId = parseResourceId(context.pathParams[STRATEGY_ID_PARAM]);
  if (strategyId === undefined) throw new StrategyNotFoundError();
  return strategyId;
}

function toPageResult<TItem>(page: PageOutput<TItem>): RouteResult {
  return {
    status: HTTP_STATUS.OK,
    data: page.items,
    pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
  };
}

function createListRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: STRATEGIES_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.list,
    handler: async ({ scope, request }): Promise<RouteResult> =>
      toPageResult(
        await dependencies.listStrategies(scope, readPage(request, decodeStrategyCursor)),
      ),
  };
}

function createCreateRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: STRATEGIES_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.create,
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const body = await readValidatedBody(request, createStrategySchema);
      const created = await dependencies.createStrategy(scope, {
        name: body.name,
        version: body.config,
      });
      return { status: HTTP_STATUS.CREATED, data: created };
    },
  };
}

function createGetRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: STRATEGY_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.get,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getStrategy(context.scope, readStrategyId(context)),
    }),
  };
}

function createDeleteRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: STRATEGY_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.delete,
    handler: async (context): Promise<RouteResult> => {
      await dependencies.deleteStrategy(context.scope, readStrategyId(context));
      return { status: HTTP_STATUS.NO_CONTENT };
    },
  };
}

function createVersionsRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: STRATEGY_VERSIONS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.versions,
    handler: async (context): Promise<RouteResult> =>
      toPageResult(
        await dependencies.listVersions(context.scope, {
          strategyId: readStrategyId(context),
          ...readPage(context.request, decodeVersionCursor),
        }),
      ),
  };
}

function createAddVersionRoute(dependencies: StrategyRouteDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: STRATEGY_VERSIONS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: STRATEGY_DOCUMENTATION.addVersion,
    handler: async (context): Promise<RouteResult> => {
      const strategyId = readStrategyId(context);
      const body = await readValidatedBody(context.request, addVersionSchema);
      const added = await dependencies.addVersion(context.scope, {
        strategyId,
        version: body.config,
      });
      return {
        status: added.isNew ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
        data: { version: added.version },
      };
    },
  };
}

export function createStrategyRoutes(dependencies: StrategyRouteDependencies): readonly Route[] {
  return [
    createListRoute(dependencies),
    createCreateRoute(dependencies),
    createGetRoute(dependencies),
    createDeleteRoute(dependencies),
    createVersionsRoute(dependencies),
    createAddVersionRoute(dependencies),
  ];
}
