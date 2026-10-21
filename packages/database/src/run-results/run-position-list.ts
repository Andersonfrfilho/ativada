// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, gt, gte, lt, or, type SQL } from 'drizzle-orm';

import { ownerCondition } from '../ownership/owner-scope.js';
import { positions } from '../schema/positions.schema.js';
import { clampLimit, toPage, type ListRequest } from './run-result-list.js';
import { toPositionInput } from './run-result-record.mapper.js';
import {
  RESULT_ORDER,
  type ListPositionsParams,
  type PositionCursor,
  type PositionInput,
  type ResultPage,
  type TimeRange,
} from './run-result.types.js';

// Decrescente: o cursor é a última posição entregue e a próxima página é a anterior a ela.
function afterPosition(params: ListPositionsParams): SQL | undefined {
  const { after } = params;
  if (after === undefined) return undefined;
  const isDescending = params.order === RESULT_ORDER.DESCENDING;
  const compare = isDescending ? lt : gt;
  return or(
    compare(positions.openedCandleTime, after.openedCandleTime),
    and(
      eq(positions.openedCandleTime, after.openedCandleTime),
      compare(positions.engineKey, after.engineKey),
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

function positionOrder(params: ListPositionsParams): SQL[] {
  const direction = params.order === RESULT_ORDER.DESCENDING ? desc : asc;
  return [direction(positions.openedCandleTime), direction(positions.engineKey)];
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
        afterPosition(params),
        positionRangeCondition(params.range),
        params.status === undefined ? undefined : eq(positions.status, params.status),
      ),
    )
    .orderBy(...positionOrder(params))
    .limit(limit + 1);
  const cursorOf = (row: (typeof rows)[number]): PositionCursor => ({
    openedCandleTime: row.openedCandleTime,
    engineKey: row.engineKey,
  });
  return toPage(rows, limit, { toItem: toPositionInput, cursorOf });
}
