// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  type AnyPgColumn,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ANALYST_DECISION_CADENCE_MINUTES,
  ANALYST_DECISION_ENTRY_GATE,
  ANALYST_DECISION_MODE,
  ANALYST_DECISION_POSTURE,
  ANALYST_DECISION_RISK_SCALE,
  ANALYST_DECISION_STATUS,
  ANALYST_DECISION_VERSION,
} from '../analyst/analyst-decision.constant.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// Valores só de constantes do código, nunca do usuário: texto entre aspas e número sem (o `numeric` compara por valor).
function allowed(
  name: string,
  column: AnyPgColumn,
  values: readonly (string | number)[],
): ReturnType<typeof check> {
  const list = values.map((value) => (typeof value === 'string' ? `'${value}'` : String(value)));
  return check(name, sql`${column} in (${sql.raw(list.join(', '))})`);
}

// A decisão do analista de risco por vela (spec 007, ADR 0002 A19): imutável por (run_id, candle_time), uma linha por vela
// decidida ou que falhou. Os blocos `forecast`, `readings`, `specialists`, `locks` e `commands` são o que o painel mostra.
export const analystDecisions = pgTable(
  'analyst_decisions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    version: varchar('version', { length: 16 }).notNull(),
    mode: varchar('mode', { length: 8 }).notNull(),
    status: varchar('status', { length: 8 }).notNull(),
    posture: varchar('posture', { length: 16 }),
    reason: varchar('reason', { length: 32 }),
    cadenceMinutes: smallint('cadence_minutes'),
    entryGate: varchar('entry_gate', { length: 8 }),
    riskScale: numeric('risk_scale'),
    isTimeExitDue: boolean('time_exit_due'),
    forecast: jsonb('forecast'),
    readings: jsonb('readings'),
    specialists: jsonb('specialists'),
    locks: jsonb('locks'),
    commands: jsonb('commands'),
    message: text('message'),
    failureCode: varchar('failure_code', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'analyst_decisions_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('analyst_decisions_run_id_candle_time_unique').on(table.runId, table.candleTime),
    index('analyst_decisions_user_id_run_id_candle_time_idx').on(
      table.userId,
      table.runId,
      table.candleTime.desc(),
    ),
    allowed('analyst_decisions_version_check', table.version, ANALYST_DECISION_VERSION),
    allowed('analyst_decisions_mode_check', table.mode, Object.values(ANALYST_DECISION_MODE)),
    allowed('analyst_decisions_status_check', table.status, Object.values(ANALYST_DECISION_STATUS)),
    allowed(
      'analyst_decisions_posture_check',
      table.posture,
      Object.values(ANALYST_DECISION_POSTURE),
    ),
    allowed(
      'analyst_decisions_cadence_check',
      table.cadenceMinutes,
      ANALYST_DECISION_CADENCE_MINUTES,
    ),
    allowed(
      'analyst_decisions_entry_gate_check',
      table.entryGate,
      Object.values(ANALYST_DECISION_ENTRY_GATE),
    ),
    allowed(
      'analyst_decisions_risk_scale_check',
      table.riskScale,
      ANALYST_DECISION_RISK_SCALE.map(Number),
    ),
    check(
      'analyst_decisions_coherence_check',
      sql`(${table.status} = 'decided' and ${table.posture} is not null and ${table.cadenceMinutes} is not null and ${table.entryGate} is not null and ${table.riskScale} is not null) or (${table.status} = 'failed' and ${table.failureCode} is not null)`,
    ),
  ],
);
