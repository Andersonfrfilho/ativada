// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { invalidCursorError } from '../shared/pagination/page-query.schema.js';
import { DEFAULT_PAGE_SIZE } from '../shared/pagination/pagination.constant.js';
import { createRunRequestSchema } from './create-run-request.schema.js';
import type { CreateRunUseCase } from './create-run.use-case.js';
import { createListRunsQuerySchema } from './list-runs-query.schema.js';
import { decodeRunCursor } from './run-cursor.js';
import { readRunId } from './run-id.js';
import type {
  DeleteRunUseCase,
  GetRunUseCase,
  ListRunsUseCase,
  StopRunUseCase,
} from './run.use-cases.js';
import { RUN_PATH, RUN_STOP_PATH, RUNS_PATH } from './runs.constant.js';
import { RUN_DOCUMENTATION } from './runs.docs.js';

export type RunRouteDependencies = {
  readonly enabled: EnabledMarkets;
  readonly createRun: CreateRunUseCase;
  readonly listRuns: ListRunsUseCase;
  readonly getRun: GetRunUseCase;
  readonly stopRun: StopRunUseCase;
  readonly deleteRun: DeleteRunUseCase;
};

function createCreateRoute(dependencies: RunRouteDependencies): Route {
  const bodySchema = createRunRequestSchema(dependencies.enabled);
  return {
    method: HTTP_METHOD.POST,
    path: RUNS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.EXECUTION_CREATION,
    documentation: { ...RUN_DOCUMENTATION.create, body: bodySchema },
    handler: async ({ scope, request }): Promise<RouteResult> => ({
      status: HTTP_STATUS.ACCEPTED,
      data: await dependencies.createRun(scope, await readValidatedBody(request, bodySchema)),
    }),
  };
}

function createListRoute(dependencies: RunRouteDependencies): Route {
  const querySchema = createListRunsQuerySchema(dependencies.enabled);
  return {
    method: HTTP_METHOD.GET,
    path: RUNS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: { ...RUN_DOCUMENTATION.list, query: querySchema },
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const query = readValidatedQuery(request, querySchema);
      const after = query.cursor === undefined ? undefined : decodeRunCursor(query.cursor);
      if (query.cursor !== undefined && after === undefined) throw invalidCursorError();
      const limit = query.limit ?? DEFAULT_PAGE_SIZE;
      const page = await dependencies.listRuns(scope, {
        limit,
        after,
        kind: query.kind,
        symbol: query.symbol,
        strategyVersionId: query.strategyVersionId,
      });
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

function createGetRoute(dependencies: RunRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: RUN_DOCUMENTATION.get,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getRun(context.scope, readRunId(context)),
    }),
  };
}

function createStopRoute(dependencies: RunRouteDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: RUN_STOP_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: RUN_DOCUMENTATION.stop,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.stopRun(context.scope, readRunId(context)),
    }),
  };
}

function createDeleteRoute(dependencies: RunRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: RUN_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: RUN_DOCUMENTATION.delete,
    handler: async (context): Promise<RouteResult> => {
      await dependencies.deleteRun(context.scope, readRunId(context));
      return { status: HTTP_STATUS.NO_CONTENT };
    },
  };
}

export function createRunRoutes(dependencies: RunRouteDependencies): readonly Route[] {
  return [
    createCreateRoute(dependencies),
    createListRoute(dependencies),
    createGetRoute(dependencies),
    createStopRoute(dependencies),
    createDeleteRoute(dependencies),
  ];
}
