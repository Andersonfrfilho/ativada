// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_FEED_SCOPE } from '@ativada/database';

import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { invalidCursorError } from '../shared/pagination/page-query.schema.js';
import type { ListNoticesInput, ListNoticesUseCase } from './list-notices.use-case.js';
import { NOTICE_PAGE_SIZE, NOTICES_PATH } from './notice.constant.js';
import { decodeNoticeCursor } from './notice-cursor.js';
import { NOTICES_DOCUMENTATION, noticesQuerySchema } from './notices.docs.js';

// `cursor` (avisos anteriores) e `after` (avisos mais novos) nunca vêm juntos; cursor adulterado é 400, nunca um filtro de texto cru.
export function readNoticesInput(request: Request): ListNoticesInput {
  const query = readValidatedQuery(request, noticesQuerySchema);
  const older = query.cursor === undefined ? undefined : decodeNoticeCursor(query.cursor);
  const newer = query.after === undefined ? undefined : decodeNoticeCursor(query.after);
  if (query.cursor !== undefined && older === undefined) throw invalidCursorError();
  if (query.after !== undefined && newer === undefined) throw invalidCursorError();
  if (older !== undefined && newer !== undefined) throw invalidCursorError();
  return {
    limit: query.limit ?? NOTICE_PAGE_SIZE.DEFAULT,
    scope: query.scope ?? NOTICE_FEED_SCOPE.ALL,
    older,
    newer,
  };
}

export function createNoticesRoute(listNotices: ListNoticesUseCase): Route {
  return {
    method: HTTP_METHOD.GET,
    path: NOTICES_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.NOTICES,
    documentation: NOTICES_DOCUMENTATION,
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const page = await listNotices(scope, readNoticesInput(request));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}
