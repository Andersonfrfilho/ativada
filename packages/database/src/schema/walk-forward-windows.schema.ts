// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { WALK_FORWARD_WINDOW_STATUS } from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Uma janela do walk-forward (RF08): imutável por (run_id, window_index). O ajuste termina antes de o teste
// começar (CHECK), e a janela sem parâmetro elegível não guarda parâmetros nem opera no teste.
export const walkForwardWindows = pgTable(
  'walk_forward_windows',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    windowIndex: integer('window_index').notNull(),
    trainStart: bigint('train_start', { mode: 'number' }).notNull(),
    trainEnd: bigint('train_end', { mode: 'number' }).notNull(),
    testStart: bigint('test_start', { mode: 'number' }).notNull(),
    testEnd: bigint('test_end', { mode: 'number' }).notNull(),
    bestParams: jsonb('best_params'),
    status: varchar('status', { length: 24 }).notNull(),
    inSample: jsonb('in_sample').notNull(),
    outOfSample: jsonb('out_of_sample').notNull(),
    eligibleCombinations: integer('eligible_combinations').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'walk_forward_windows_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('walk_forward_windows_run_id_window_index_unique').on(
      table.runId,
      table.windowIndex,
    ),
    index('walk_forward_windows_user_id_run_id_idx').on(table.userId, table.runId),
    check(
      'walk_forward_windows_status_check',
      sql`${table.status} in (${literalList(Object.values(WALK_FORWARD_WINDOW_STATUS))})`,
    ),
    check('walk_forward_windows_index_check', sql`${table.windowIndex} >= 0`),
    check(
      'walk_forward_windows_train_before_test_check',
      sql`${table.trainStart} < ${table.trainEnd} and ${table.trainEnd} <= ${table.testStart} and ${table.testStart} < ${table.testEnd}`,
    ),
    check(
      'walk_forward_windows_eligible_count_check',
      sql`${table.eligibleCombinations} >= 0 and (${table.status} <> 'no_eligible_parameters' or ${table.eligibleCombinations} = 0)`,
    ),
    check(
      'walk_forward_windows_params_match_status_check',
      sql`(${table.status} = 'ok') = (${table.bestParams} is not null)`,
    ),
  ],
);
