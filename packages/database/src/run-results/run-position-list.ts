// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gt, gte, lt, or, type SQL } from 'drizzle-orm';

import { ownerCondition } from '../ownership/owner-scope.js';
import { positions } from '../schema/positions.schema.js';
import { clampLimit, toPage, type ListRequest } from './run-result-list.js';
import { toPositionInput } from './run-result-record.mapper.js';
import type {
  ListPositionsParams,
  PositionCursor,
  PositionInput,
  ResultPage,
  TimeRange,
} from './run-result.types.js';

function afterPosition(after: PositionCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return or(
    gt(positions.openedCandleTime, after.openedCandleTime),
    and(
      eq(positions.openedCandleTime, after.openedCandleTime),
      gt(positions.engineKey, after.engineKey),
    ),
  );
}

type PositionTimeColumn = typeof positions.openedCandleTime | typeof positions.closedCandleTime;

// A posição entra se a compra OU a venda cai na faixa; a que atravessa a faixa sem preenchimento nela fica fora.
function positionRangeCondition(range: TimeRange | undefined): SQL | undefined {
  if (range === undefined) return undefined;
  const isInside = (column: PositionTimeColumn): SQL | undefined =>
    and(gte(column, range.from), lt(column, range.to));
  return or(isInside(positions.openedCandleTime), isInside(positions.closedCandleTime));
}

export async function listPositions(
  request: Omit<ListRequest<PositionCursor>, 'params'> & { readonly params: ListPositionsParams },
): Promise<ResultPage<PositionInput, PositionCursor>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select()
    .from(positions)
    .where(
      and(
        ownerCondition(scope, positions.userId),
        eq(positions.runId, runId),
        afterPosition(params.after),
        positionRangeCondition(params.range),
        params.status === undefined ? undefined : eq(positions.status, params.status),
      ),
    )
    .orderBy(asc(positions.openedCandleTime), asc(positions.engineKey))
    .limit(limit + 1);
  const cursorOf = (row: (typeof rows)[number]): PositionCursor => ({
    openedCandleTime: row.openedCandleTime,
    engineKey: row.engineKey,
  });
  return toPage(rows, limit, { toItem: toPositionInput, cursorOf });
}
