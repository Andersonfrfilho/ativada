// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gt } from 'drizzle-orm';

import { ownerCondition } from '../ownership/owner-scope.js';
import { walkForwardWindows } from '../schema/walk-forward-windows.schema.js';
import { toWindowInput } from './run-result-record.mapper.js';
import { clampLimit, toPage, type ListRequest } from './run-result-list.js';
import type { ResultPage, WalkForwardWindowInput } from './run-result.types.js';

export async function listWindows(
  request: ListRequest<number>,
): Promise<ResultPage<WalkForwardWindowInput, number>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select()
    .from(walkForwardWindows)
    .where(
      and(
        ownerCondition(scope, walkForwardWindows.userId),
        eq(walkForwardWindows.runId, runId),
        params.after === undefined ? undefined : gt(walkForwardWindows.windowIndex, params.after),
      ),
    )
    .orderBy(asc(walkForwardWindows.windowIndex))
    .limit(limit + 1);
  return toPage(rows, limit, { toItem: toWindowInput, cursorOf: (row) => row.windowIndex });
}
