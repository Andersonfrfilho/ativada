// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ENGINE_KEY_MAX_LENGTH,
  ORDER_PURPOSE,
  ORDER_REASON,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
} from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// `engine_key` carrega o prefixo `w<i>:` do walk-forward; o status só avança (created < estado final).
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    engineKey: varchar('engine_key', { length: ENGINE_KEY_MAX_LENGTH }).notNull(),
    side: varchar('side', { length: 8 }).notNull(),
    type: varchar('type', { length: 8 }).notNull(),
    purpose: varchar('purpose', { length: 8 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 32 }),
    quantity: numeric('quantity'),
    price: numeric('price'),
    limitPrice: numeric('limit_price'),
    triggerPrice: numeric('trigger_price'),
    riskAmount: numeric('risk_amount'),
    stopDistance: numeric('stop_distance'),
    targetDistance: numeric('target_distance'),
    eligibleCandles: integer('eligible_candles'),
    createdCandleTime: bigint('created_candle_time', { mode: 'number' }).notNull(),
    expiresCandleTime: bigint('expires_candle_time', { mode: 'number' }),
    lastEventCandleTime: bigint('last_event_candle_time', { mode: 'number' }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'orders_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('orders_run_id_engine_key_unique').on(table.runId, table.engineKey),
    index('orders_user_id_run_id_idx').on(table.userId, table.runId),
    check('orders_side_check', sql`${table.side} in (${literalList(Object.values(ORDER_SIDE))})`),
    check('orders_type_check', sql`${table.type} in (${literalList(Object.values(ORDER_TYPE))})`),
    check(
      'orders_purpose_check',
      sql`${table.purpose} in (${literalList(Object.values(ORDER_PURPOSE))})`,
    ),
    check(
      'orders_status_check',
      sql`${table.status} in (${literalList(Object.values(ORDER_STATUS))})`,
    ),
    check(
      'orders_reason_check',
      sql`${table.reason} is null or ${table.reason} in (${literalList(Object.values(ORDER_REASON))})`,
    ),
  ],
);
