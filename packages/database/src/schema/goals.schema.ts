// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  GOAL_MAXIMUM_HORIZON_DAYS,
  GOAL_MAXIMUM_TARGET_RATE,
  GOAL_SYMBOL_MAX_LENGTH,
  GOAL_SYMBOL_PATTERN,
} from '../goals/goal.constant.js';
import { literalList } from './check-literals.js';
import { users } from './users.schema.js';

// A meta do usuário (RF13): ganho alvo e perda máxima como frações do saldo ("0.03" = 3%), prazo em dias. `UNIQUE (id, user_id)`
// existe para a execução que nascer atrelada a ela referenciar a meta por FK composta (o banco recusa dono divergente).
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    symbol: varchar('symbol', { length: GOAL_SYMBOL_MAX_LENGTH }).notNull(),
    targetRate: numeric('target_rate').notNull(),
    horizonDays: integer('horizon_days').notNull(),
    maxLossRate: numeric('max_loss_rate').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('goals_id_user_id_unique').on(table.id, table.userId),
    index('goals_user_id_created_at_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
    check('goals_symbol_check', sql`${table.symbol} ~ ${literalList([GOAL_SYMBOL_PATTERN])}`),
    check(
      'goals_target_rate_check',
      sql`${table.targetRate} > 0 and ${table.targetRate} <= ${sql.raw(GOAL_MAXIMUM_TARGET_RATE)}`,
    ),
    check('goals_max_loss_rate_check', sql`${table.maxLossRate} > 0 and ${table.maxLossRate} < 1`),
    check(
      'goals_horizon_days_check',
      sql`${table.horizonDays} between 1 and ${sql.raw(String(GOAL_MAXIMUM_HORIZON_DAYS))}`,
    ),
  ],
);
