// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { ENGINE_KEY_MAX_LENGTH, ORDER_SIDE } from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// A chave única (run_id, order_key, candle_time) é a do ADR 0002 §b: um preenchimento por ordem e candle.
export const fills = pgTable(
  'fills',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    orderKey: varchar('order_key', { length: ENGINE_KEY_MAX_LENGTH }).notNull(),
    positionKey: varchar('position_key', { length: ENGINE_KEY_MAX_LENGTH }).notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    side: varchar('side', { length: 8 }).notNull(),
    price: numeric('price').notNull(),
    quantity: numeric('quantity').notNull(),
    notional: numeric('notional').notNull(),
    fee: numeric('fee').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'fills_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('fills_run_id_order_key_candle_time_unique').on(
      table.runId,
      table.orderKey,
      table.candleTime,
    ),
    index('fills_user_id_run_id_idx').on(table.userId, table.runId),
    check('fills_side_check', sql`${table.side} in (${literalList(Object.values(ORDER_SIDE))})`),
  ],
);
