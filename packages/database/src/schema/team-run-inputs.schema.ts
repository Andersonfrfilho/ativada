// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  MODEL_TEAM_FAILURE_CODE_MAX_LENGTH,
  MODEL_TEAM_REPORT_ACTION,
} from '../model-teams/model-team.constant.js';
import { literalList } from './check-literals.js';
import { modelTeamReports } from './model-team-reports.schema.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// A entrada gravada de uma execução de equipe, uma por vela (plan D9): qual relatório decidiu a vela, ou o código de por que não
// houve leitura. O replay lê esta linha e nunca o relógio nem o provedor.
export const teamRunInputs = pgTable(
  'team_run_inputs',
  {
    runId: uuid('run_id').notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reportId: uuid('report_id').references(() => modelTeamReports.id, { onDelete: 'restrict' }),
    failureCode: varchar('failure_code', { length: MODEL_TEAM_FAILURE_CODE_MAX_LENGTH }),
    appliedAction: varchar('applied_action', { length: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'team_run_inputs_pkey', columns: [table.runId, table.candleTime] }),
    foreignKey({
      name: 'team_run_inputs_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    check(
      'team_run_inputs_applied_action_check',
      sql`${table.appliedAction} in (${literalList(Object.values(MODEL_TEAM_REPORT_ACTION))})`,
    ),
    check(
      'team_run_inputs_source_check',
      sql`${table.reportId} is not null or ${table.failureCode} is not null`,
    ),
  ],
);
