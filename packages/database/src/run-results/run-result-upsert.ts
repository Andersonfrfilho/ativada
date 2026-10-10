// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { orders } from '../schema/orders.schema.js';
import { positions } from '../schema/positions.schema.js';
import { ORDER_STATUS, POSITION_STATUS } from './run-result.constant.js';
import { chunkRows, mergeMonotonic } from './run-result-merge.js';
import type { WriteRequest } from './run-result-write.types.js';
import type { OrderInput, PositionInput } from './run-result.types.js';

const ORDER_COLUMN_COUNT = Object.keys(getTableColumns(orders)).length;
const POSITION_COLUMN_COUNT = Object.keys(getTableColumns(positions)).length;

// 0 = estado inicial, 1 = qualquer estado final: o estado final não muda para outro final nem volta atrás.
function rankSql(status: SQL | PgColumn, initialStatus: string): SQL {
  return sql`(case when ${status} = ${initialStatus} then 0 else 1 end)`;
}

function rankOf(status: string, initialStatus: string): number {
  return status === initialStatus ? 0 : 1;
}

function keepKnown(column: PgColumn): SQL {
  return sql`coalesce(excluded.${sql.identifier(column.name)}, ${column})`;
}

const ORDER_CONFLICT_UPDATE = {
  status: sql`excluded.status`,
  reason: keepKnown(orders.reason),
  quantity: keepKnown(orders.quantity),
  price: keepKnown(orders.price),
  limitPrice: keepKnown(orders.limitPrice),
  triggerPrice: keepKnown(orders.triggerPrice),
  riskAmount: keepKnown(orders.riskAmount),
  stopDistance: keepKnown(orders.stopDistance),
  targetDistance: keepKnown(orders.targetDistance),
  eligibleCandles: keepKnown(orders.eligibleCandles),
  expiresCandleTime: keepKnown(orders.expiresCandleTime),
  lastEventCandleTime: sql`greatest(excluded.last_event_candle_time, ${orders.lastEventCandleTime})`,
};

const ORDER_ADVANCES_STATUS = sql`${rankSql(sql`excluded.status`, ORDER_STATUS.CREATED)} > ${rankSql(orders.status, ORDER_STATUS.CREATED)} and ${orders.userId} = excluded.user_id`;

export async function writeOrders(request: WriteRequest<OrderInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  const merged = mergeMonotonic(request.rows, {
    keyOf: (row) => row.engineKey,
    rankOf: (row) => rankOf(row.status, ORDER_STATUS.CREATED),
  });
  let written = 0;
  for (const chunk of chunkRows(merged, ORDER_COLUMN_COUNT)) {
    const touched = await executor
      .insert(orders)
      .values(chunk.map((row) => ({ id: Bun.randomUUIDv7(), userId: ownerUserId, runId, ...row })))
      .onConflictDoUpdate({
        target: [orders.runId, orders.engineKey],
        set: ORDER_CONFLICT_UPDATE,
        setWhere: ORDER_ADVANCES_STATUS,
      })
      .returning({ id: orders.id });
    written += touched.length;
  }
  return written;
}

export async function writePositions(request: WriteRequest<PositionInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  const merged = mergeMonotonic(request.rows, {
    keyOf: (row) => row.engineKey,
    rankOf: (row) => rankOf(row.status, POSITION_STATUS.OPEN),
  });
  let written = 0;
  for (const chunk of chunkRows(merged, POSITION_COLUMN_COUNT)) {
    const touched = await executor
      .insert(positions)
      .values(
        chunk.map((row) => ({
          id: Bun.randomUUIDv7(),
          userId: ownerUserId,
          runId,
          ...row,
        })),
      )
      .onConflictDoUpdate({
        target: [positions.runId, positions.engineKey],
        set: {
          status: sql`excluded.status`,
          exitPrice: keepKnown(positions.exitPrice),
          exitFee: keepKnown(positions.exitFee),
          netProfit: keepKnown(positions.netProfit),
          exitReason: keepKnown(positions.exitReason),
          closedCandleTime: keepKnown(positions.closedCandleTime),
        },
        setWhere: sql`${rankSql(sql`excluded.status`, POSITION_STATUS.OPEN)} > ${rankSql(positions.status, POSITION_STATUS.OPEN)} and ${positions.userId} = excluded.user_id`,
      })
      .returning({ id: positions.id });
    written += touched.length;
  }
  return written;
}
