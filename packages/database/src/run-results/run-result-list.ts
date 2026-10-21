// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, gt, lt, or, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { fills } from '../schema/fills.schema.js';
import { orders } from '../schema/orders.schema.js';
import { signals } from '../schema/signals.schema.js';
import { RESULT_PAGE_MAXIMUM_SIZE } from './run-result.constant.js';
import { toFillInput, toOrderInput, toSignalInput } from './run-result-record.mapper.js';
import { RESULT_ORDER } from './run-result.types.js';
import type {
  EquityPointInput,
  FillCursor,
  FillInput,
  ListResultsParams,
  OrderCursor,
  OrderInput,
  ResultPage,
  SignalInput,
} from './run-result.types.js';

export type ListRequest<TCursor> = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: ListResultsParams<TCursor>;
};

export function clampLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), RESULT_PAGE_MAXIMUM_SIZE);
}

// Lê uma linha a mais para saber se há próxima página sem uma contagem à parte.
export function toPage<TRow, TItem, TCursor>(
  rows: readonly TRow[],
  limit: number,
  mapping: { readonly toItem: (row: TRow) => TItem; readonly cursorOf: (row: TRow) => TCursor },
): ResultPage<TItem, TCursor> {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(mapping.toItem),
    nextCursor: rows.length > limit && last !== undefined ? mapping.cursorOf(last) : undefined,
  };
}

type TimeColumn = typeof signals.candleTime | typeof equityPoints.candleTime;

// Decrescente: o cursor é o último instante já entregue e a próxima página é a anterior a ele.
function timeCursorCondition(
  column: TimeColumn,
  params: ListResultsParams<number>,
): SQL | undefined {
  if (params.after === undefined) return undefined;
  return params.order === RESULT_ORDER.DESCENDING
    ? lt(column, params.after)
    : gt(column, params.after);
}

function timeOrder(column: TimeColumn, params: ListResultsParams<number>): SQL {
  return params.order === RESULT_ORDER.DESCENDING ? desc(column) : asc(column);
}

export async function listSignals(
  request: ListRequest<number>,
): Promise<ResultPage<SignalInput, number>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select()
    .from(signals)
    .where(
      and(
        ownerCondition(scope, signals.userId),
        eq(signals.runId, runId),
        timeCursorCondition(signals.candleTime, params),
      ),
    )
    .orderBy(timeOrder(signals.candleTime, params))
    .limit(limit + 1);
  return toPage(rows, limit, { toItem: toSignalInput, cursorOf: (row) => row.candleTime });
}

export async function listEquityPoints(
  request: ListRequest<number>,
): Promise<ResultPage<EquityPointInput, number>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select({
      candleTime: equityPoints.candleTime,
      equity: equityPoints.equity,
      equityAtLow: equityPoints.equityAtLow,
      benchmark: equityPoints.benchmark,
    })
    .from(equityPoints)
    .where(
      and(
        ownerCondition(scope, equityPoints.userId),
        eq(equityPoints.runId, runId),
        timeCursorCondition(equityPoints.candleTime, params),
      ),
    )
    .orderBy(timeOrder(equityPoints.candleTime, params))
    .limit(limit + 1);
  return toPage(rows, limit, { toItem: (row) => row, cursorOf: (row) => row.candleTime });
}

function afterOrder(after: OrderCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return or(
    gt(orders.createdCandleTime, after.createdCandleTime),
    and(
      eq(orders.createdCandleTime, after.createdCandleTime),
      gt(orders.engineKey, after.engineKey),
    ),
  );
}

export async function listOrders(
  request: ListRequest<OrderCursor>,
): Promise<ResultPage<OrderInput, OrderCursor>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select()
    .from(orders)
    .where(
      and(ownerCondition(scope, orders.userId), eq(orders.runId, runId), afterOrder(params.after)),
    )
    .orderBy(asc(orders.createdCandleTime), asc(orders.engineKey))
    .limit(limit + 1);
  const cursorOf = (row: (typeof rows)[number]): OrderCursor => ({
    createdCandleTime: row.createdCandleTime,
    engineKey: row.engineKey,
  });
  return toPage(rows, limit, { toItem: toOrderInput, cursorOf });
}

function afterFill(after: FillCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return or(
    gt(fills.candleTime, after.candleTime),
    and(eq(fills.candleTime, after.candleTime), gt(fills.orderKey, after.orderKey)),
  );
}

export async function listFills(
  request: ListRequest<FillCursor>,
): Promise<ResultPage<FillInput, FillCursor>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select()
    .from(fills)
    .where(
      and(ownerCondition(scope, fills.userId), eq(fills.runId, runId), afterFill(params.after)),
    )
    .orderBy(asc(fills.candleTime), asc(fills.orderKey))
    .limit(limit + 1);
  const cursorOf = (row: (typeof rows)[number]): FillCursor => ({
    candleTime: row.candleTime,
    orderKey: row.orderKey,
  });
  return toPage(rows, limit, { toItem: toFillInput, cursorOf });
}
