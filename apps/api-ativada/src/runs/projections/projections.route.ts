// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { invalidCursorError } from '../../shared/pagination/page-query.schema.js';
import { decodeTimeCursor } from '../run-cursor.js';
import { readRunId } from '../run-id.js';
import { RUN_PROJECTIONS_PATH } from '../runs.constant.js';
import { PROJECTIONS_DOCUMENTATION } from './projections.docs.js';
import { projectionsQuerySchema } from './projections.schema.js';
import { PROJECTIONS_PAGE_SIZE } from './projections.constant.js';
import type { ProjectionsInput, ProjectionsUseCase } from './projections.use-case.js';

// `limit` (1 a 100, padrão 24) e `cursor` opaco; cursor adulterado é 400, nunca um filtro montado de texto cru.
function readProjectionsInput(request: Request): ProjectionsInput {
  const query = readValidatedQuery(request, projectionsQuerySchema);
  const before = query.cursor === undefined ? undefined : decodeTimeCursor(query.cursor);
  if (query.cursor !== undefined && before === undefined) throw invalidCursorError();
  return { before, limit: query.limit ?? PROJECTIONS_PAGE_SIZE.DEFAULT };
}

export function createProjectionsRoute(projections: ProjectionsUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_PROJECTIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: PROJECTIONS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const input = readProjectionsInput(context.request);
      return { status: HTTP_STATUS.OK, data: await projections(context.scope, runId, input) };
    },
  };
}
