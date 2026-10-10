// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  COMMAND_ID_MAX_LENGTH,
  COMMAND_KIND,
  COMMAND_REASON,
  COMMAND_STATUS,
} from '../run-results/run-result.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Entrada persistida do passo e trilha: o `command_id` é único por execução, o primeiro registro vale.
export const runCommands = pgTable(
  'run_commands',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    commandId: varchar('command_id', { length: COMMAND_ID_MAX_LENGTH }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 16 }).notNull(),
    issuedAt: bigint('issued_at', { mode: 'number' }).notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 24 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'run_commands_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('run_commands_run_id_command_id_unique').on(table.runId, table.commandId),
    index('run_commands_user_id_run_id_idx').on(table.userId, table.runId),
    check(
      'run_commands_kind_check',
      sql`${table.kind} in (${literalList(Object.values(COMMAND_KIND))})`,
    ),
    check(
      'run_commands_reason_check',
      sql`${table.reason} in (${literalList(Object.values(COMMAND_REASON))})`,
    ),
    check(
      'run_commands_status_check',
      sql`${table.status} in (${literalList(Object.values(COMMAND_STATUS))})`,
    ),
  ],
);
