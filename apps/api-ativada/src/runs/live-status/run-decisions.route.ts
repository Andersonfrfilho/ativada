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
import { LIVE_DECISIONS_PAGE_SIZE, RUN_DECISIONS_PATH } from '../runs.constant.js';
import { RUN_DECISIONS_DOCUMENTATION, runDecisionsQuerySchema } from './run-decisions.docs.js';
import type { RunDecisionsInput, RunDecisionsUseCase } from './run-decisions.use-case.js';

// `limit` (1 a 100, padrão 24) e `cursor` opaco; cursor adulterado é 400, nunca um filtro montado de texto cru.
export function readDecisionsInput(request: Request): RunDecisionsInput {
  const query = readValidatedQuery(request, runDecisionsQuerySchema);
  const before = query.cursor === undefined ? undefined : decodeTimeCursor(query.cursor);
  if (query.cursor !== undefined && before === undefined) throw invalidCursorError();
  return { before, limit: query.limit ?? LIVE_DECISIONS_PAGE_SIZE.DEFAULT };
}

export function createRunDecisionsRoute(decisions: RunDecisionsUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_DECISIONS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,
    documentation: RUN_DECISIONS_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const page = await decisions(context.scope, runId, readDecisionsInput(context.request));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}
