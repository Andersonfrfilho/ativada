// Copyright (c) 2026 Ada Technology. All rights reserved.
import { bigint, foreignKey, index, numeric, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Imutável por (run_id, candle_time); `equity_at_low` é a liquidação na mínima do candle (piso do RF09).
export const equityPoints = pgTable(
  'equity_points',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    equity: numeric('equity').notNull(),
    equityAtLow: numeric('equity_at_low').notNull(),
    benchmark: numeric('benchmark').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.candleTime] }),
    foreignKey({
      name: 'equity_points_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    index('equity_points_user_id_run_id_idx').on(table.userId, table.runId),
  ],
);
