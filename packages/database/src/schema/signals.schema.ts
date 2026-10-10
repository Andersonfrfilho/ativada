// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { REGIME, SIGNAL_ACTION } from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Imutável por (run_id, candle_time): o sinal de um candle nunca muda depois de gravado (ADR 0002 §b).
export const signals = pgTable(
  'signals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    action: varchar('action', { length: 8 }).notNull(),
    score: numeric('score').notNull(),
    regime: varchar('regime', { length: 16 }).notNull(),
    votes: jsonb('votes').notNull(),
    indicators: jsonb('indicators').notNull(),
    sentimentObservation: jsonb('sentiment_observation'),
    reason: text('reason').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'signals_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('signals_run_id_candle_time_unique').on(table.runId, table.candleTime),
    index('signals_user_id_run_id_idx').on(table.userId, table.runId),
    check(
      'signals_action_check',
      sql`${table.action} in (${literalList(Object.values(SIGNAL_ACTION))})`,
    ),
    check('signals_regime_check', sql`${table.regime} in (${literalList(Object.values(REGIME))})`),
  ],
);
