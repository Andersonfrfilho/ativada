// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import { RUN_PAGE_MAXIMUM_SIZE } from './run.constant.js';
import { RUN_COLUMNS, toRunRecord } from './run-record.mapper.js';
import type { ListRunsParams, RunCursor, RunsPage } from './run.types.js';

function isAfterCursor(after: RunCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return sql`(${runs.createdAt}, ${runs.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), RUN_PAGE_MAXIMUM_SIZE);
}

// O cursor leva `created_at::text`, com microssegundos: ordenar e comparar por Date repetiria linhas (ADR 0001 §n).
export async function listRuns(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListRunsParams,
): Promise<RunsPage> {
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select({ ...RUN_COLUMNS, createdAtText: sql<string>`${runs.createdAt}::text` })
    .from(runs)
    .where(
      and(
        ownerCondition(scope, runs.userId),
        isNull(runs.deletedAt),
        params.kind === undefined ? undefined : eq(runs.kind, params.kind),
        params.symbol === undefined ? undefined : eq(runs.symbol, params.symbol),
        params.strategyVersionId === undefined
          ? undefined
          : eq(runs.strategyVersionId, params.strategyVersionId),
        isAfterCursor(params.after),
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const hasMore = rows.length > limit;
  return {
    runs: page.map(toRunRecord),
    nextCursor:
      hasMore && last !== undefined ? { createdAt: last.createdAtText, id: last.id } : undefined,
  };
}
