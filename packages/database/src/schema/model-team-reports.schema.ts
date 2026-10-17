// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
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
  MODEL_TEAM_FAILURE_CODE_MAX_LENGTH,
  MODEL_TEAM_MODEL_ID_MAX_LENGTH,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
} from '../model-teams/model-team.constant.js';
import { literalList } from './check-literals.js';
import { buildReportChecks } from './model-team-report-checks.js';

const NUMERIC_COST = { precision: 14, scale: 8 } as const;

// O relatório que uma equipe de modelo deu sobre uma vela de 15 min (spec 015): dado PÚBLICO de mercado, como `candles`, sem
// `user_id`. Uma linha `scheduled` por (equipe, par, vela, versão do prompt) é compartilhada entre todos os usuários.
export const modelTeamReports = pgTable(
  'model_team_reports',
  {
    id: uuid('id').primaryKey(),
    teamKey: varchar('team_key', { length: 8 }).notNull(),
    provider: varchar('provider', { length: 16 }).notNull(),
    modelId: varchar('model_id', { length: MODEL_TEAM_MODEL_ID_MAX_LENGTH }).notNull(),
    promptVersion: varchar('prompt_version', { length: 16 }).notNull(),
    kind: varchar('kind', { length: 12 }).notNull(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    timeframe: varchar('timeframe', { length: 4 }).notNull(),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 8 }).notNull(),
    action: varchar('action', { length: 4 }),
    entryPrice: numeric('entry_price'),
    targetPrice: numeric('target_price'),
    stopPrice: numeric('stop_price'),
    confidence: smallint('confidence'),
    roles: jsonb('roles'),
    isReasonHidden: boolean('reason_hidden').notNull().default(false),
    input: jsonb('input'),
    promptHash: char('prompt_hash', { length: 64 }),
    rawOutput: text('raw_output'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    thinkingTokens: integer('thinking_tokens'),
    latencyMilliseconds: integer('latency_ms'),
    costUsd: numeric('cost_usd', NUMERIC_COST).notNull().default('0'),
    reservedUsd: numeric('reserved_usd', NUMERIC_COST).notNull().default('0'),
    failureCode: varchar('failure_code', { length: MODEL_TEAM_FAILURE_CODE_MAX_LENGTH }),
    attempt: smallint('attempt').notNull().default(0),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    requestedDay: date('requested_day', { mode: 'string' })
      .notNull()
      .default(sql`(now() at time zone 'UTC')::date`),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('model_team_reports_scheduled_unique')
      .on(table.teamKey, table.symbol, table.timeframe, table.candleTime, table.promptVersion)
      .where(sql`${table.kind} = ${literalList([MODEL_TEAM_REPORT_KIND.SCHEDULED])}`),
    index('model_team_reports_pending')
      .on(table.requestedAt)
      .where(sql`${table.status} = ${literalList([MODEL_TEAM_REPORT_STATUS.PENDING])}`),
    index('model_team_reports_audit').on(table.symbol, table.teamKey, table.candleTime.desc()),
    index('model_team_reports_day').on(table.requestedDay),
    ...buildReportChecks(table),
  ],
);
