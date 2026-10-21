// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../../router/route-access.constant.js';
import type { Route } from '../../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../../shared/http/http.constant.js';
import { readValidatedQuery } from '../../shared/http/read-validated-query.js';
import type { RouteResult } from '../../shared/http/response-envelope.js';
import { invalidCursorError } from '../../shared/pagination/page-query.schema.js';
import { DEFAULT_PAGE_SIZE } from '../../shared/pagination/pagination.constant.js';
import { decodePositionCursor } from '../run-cursor.js';
import { readRunId } from '../run-id.js';
import { RUN_TRADES_PATH } from '../runs.constant.js';
import { RUN_TRADES_DOCUMENTATION } from './run-trades.docs.js';
import { tradesQuerySchema } from './run-trades.schema.js';
import type { RunTradesUseCase, TradesPageInput } from './run-trades.use-case.js';

const OPEN_ENDED_START = 0;
const OPEN_ENDED_END = Number.MAX_SAFE_INTEGER;

function readTradesInput(request: Request): TradesPageInput {
  const query = readValidatedQuery(request, tradesQuerySchema);
  const after = query.cursor === undefined ? undefined : decodePositionCursor(query.cursor);
  if (query.cursor !== undefined && after === undefined) throw invalidCursorError();
  const hasRange = query.from !== undefined || query.to !== undefined;
  return {
    limit: query.limit ?? DEFAULT_PAGE_SIZE,
    after,
    range: hasRange
      ? { from: query.from ?? OPEN_ENDED_START, to: query.to ?? OPEN_ENDED_END }
      : undefined,
    status: query.status,
    ...(query.order === undefined ? {} : { order: query.order }),
  };
}

export function createRunTradesRoute(trades: RunTradesUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: RUN_TRADES_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: RUN_TRADES_DOCUMENTATION,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const page = await trades(context.scope, runId, readTradesInput(context.request));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}
