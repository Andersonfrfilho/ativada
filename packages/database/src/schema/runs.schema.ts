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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  RUN_HASH_LENGTH,
  RUN_KIND,
  RUN_PROGRESS_MAXIMUM,
  RUN_STATUS,
  RUN_TIMEFRAMES,
  TERMINAL_RUN_STATUSES,
} from '../runs/run.constant.js';
import { literalList } from './check-literals.js';
import { runGoalConstraints } from './runs-goal.schema.js';
import { runQueueConstraints } from './runs-queue.schema.js';
import { strategyVersions } from './strategies.schema.js';
import { users } from './users.schema.js';

const VERSION_LABEL_MAX_LENGTH = 32;
const CLAIMED_BY_MAX_LENGTH = 64;

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    strategyVersionId: uuid('strategy_version_id').notNull(),
    kind: varchar('kind', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default(RUN_STATUS.QUEUED),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    timeframe: varchar('timeframe', { length: 8 }).notNull(),
    runParameters: jsonb('run_parameters').notNull(),
    runHash: varchar('run_hash', { length: RUN_HASH_LENGTH }).notNull(),
    engineVersion: varchar('engine_version', { length: VERSION_LABEL_MAX_LENGTH }).notNull(),
    signalEngineVersion: varchar('signal_engine_version', {
      length: VERSION_LABEL_MAX_LENGTH,
    }).notNull(),
    metricsVersion: varchar('metrics_version', { length: VERSION_LABEL_MAX_LENGTH }).notNull(),
    periodStart: bigint('period_start', { mode: 'number' }).notNull(),
    periodEnd: bigint('period_end', { mode: 'number' }),
    engineState: jsonb('engine_state'),
    lastCandleTime: bigint('last_candle_time', { mode: 'number' }),
    metrics: jsonb('metrics'),
    progress: integer('progress').notNull().default(0),
    errorCode: varchar('error_code', { length: 64 }),
    migratedFromRunId: uuid('migrated_from_run_id'),
    request: jsonb('request'),
    goalId: uuid('goal_id'),
    goalOutcome: varchar('goal_outcome', { length: 16 }),
    goalOutcomeCandleTime: bigint('goal_outcome_candle_time', { mode: 'number' }),
    claimedBy: varchar('claimed_by', { length: CLAIMED_BY_MAX_LENGTH }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'runs_strategy_version_id_user_id_fk',
      columns: [table.strategyVersionId, table.userId],
      foreignColumns: [strategyVersions.id, strategyVersions.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'runs_migrated_from_run_id_user_id_fk',
      columns: [table.migratedFromRunId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete('restrict'),
    unique('runs_id_user_id_unique').on(table.id, table.userId),
    index('runs_user_id_created_at_id_idx').on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('runs_strategy_version_id_user_id_idx').on(table.strategyVersionId, table.userId),
    index('runs_migrated_from_run_id_idx')
      .on(table.migratedFromRunId)
      .where(sql`${table.migratedFromRunId} is not null`),
    check('runs_kind_check', sql`${table.kind} in (${literalList(Object.values(RUN_KIND))})`),
    check('runs_status_check', sql`${table.status} in (${literalList(Object.values(RUN_STATUS))})`),
    check('runs_timeframe_check', sql`${table.timeframe} in (${literalList(RUN_TIMEFRAMES)})`),
    check(
      'runs_progress_range_check',
      sql`${table.progress} between 0 and ${sql.raw(String(RUN_PROGRESS_MAXIMUM))}`,
    ),
    check(
      'runs_period_order_check',
      sql`${table.periodEnd} is null or ${table.periodEnd} > ${table.periodStart}`,
    ),
    ...runQueueConstraints(table),
    ...runGoalConstraints(table),
    check(
      'runs_finished_matches_terminal_status_check',
      sql`(${table.status} in (${literalList(TERMINAL_RUN_STATUSES)})) = (${table.finishedAt} is not null)`,
    ),
  ],
);
