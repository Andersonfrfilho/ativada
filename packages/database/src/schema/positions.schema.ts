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

import {
  ENGINE_KEY_MAX_LENGTH,
  EXIT_REASON,
  POSITION_STATUS,
} from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Upsert monotônico: a posição vai de `open` para `closed` e a fechada nunca reabre.
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    engineKey: varchar('engine_key', { length: ENGINE_KEY_MAX_LENGTH }).notNull(),
    status: varchar('status', { length: 8 }).notNull(),
    entryPrice: numeric('entry_price').notNull(),
    quantity: numeric('quantity').notNull(),
    stopPrice: numeric('stop_price').notNull(),
    targetPrice: numeric('target_price').notNull(),
    entryFee: numeric('entry_fee').notNull(),
    exitPrice: numeric('exit_price'),
    exitFee: numeric('exit_fee'),
    netProfit: numeric('net_profit'),
    exitReason: varchar('exit_reason', { length: 16 }),
    openedCandleTime: bigint('opened_candle_time', { mode: 'number' }).notNull(),
    closedCandleTime: bigint('closed_candle_time', { mode: 'number' }),
  },
  (table) => [
    foreignKey({
      name: 'positions_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('positions_run_id_engine_key_unique').on(table.runId, table.engineKey),
    index('positions_user_id_run_id_idx').on(table.userId, table.runId),
    check(
      'positions_status_check',
      sql`${table.status} in (${literalList(Object.values(POSITION_STATUS))})`,
    ),
    check(
      'positions_exit_reason_check',
      sql`${table.exitReason} is null or ${table.exitReason} in (${literalList(Object.values(EXIT_REASON))})`,
    ),
    check(
      'positions_closed_has_exit_check',
      sql`${table.status} = 'open' or (${table.exitPrice} is not null and ${table.exitFee} is not null and ${table.netProfit} is not null and ${table.exitReason} is not null and ${table.closedCandleTime} is not null)`,
    ),
  ],
);
