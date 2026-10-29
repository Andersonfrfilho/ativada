// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  check,
  type AnyPgColumn,
  type CheckBuilder,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  MODEL_TEAM_ANSWER_MAX_LENGTH,
  MODEL_TEAM_FAILURE_CODE_MAX_LENGTH,
  MODEL_TEAM_KEYS,
  MODEL_TEAM_MODEL_ID_MAX_LENGTH,
  MODEL_TEAM_PROVIDERS,
  MODEL_TEAM_QUESTION_MAX_LENGTH,
  MODEL_TEAM_QUESTION_MIN_LENGTH,
  MODEL_TEAM_QUESTION_STATUS,
} from '../model-teams/model-team.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

const NUMERIC_COST = { precision: 14, scale: 8 } as const;
const raw = (value: number): ReturnType<typeof sql.raw> => sql.raw(String(value));

type QuestionCheckColumns = Record<
  'teamKey' | 'provider' | 'status' | 'question' | 'answer' | 'failureCode',
  AnyPgColumn
>;

// As restrições de coerência, à parte para o esquema caber no limite por função.
function buildQuestionChecks(table: QuestionCheckColumns): readonly CheckBuilder[] {
  return [
    check(
      'model_team_questions_team_key_check',
      sql`${table.teamKey} in (${literalList(MODEL_TEAM_KEYS)})`,
    ),
    check(
      'model_team_questions_provider_check',
      sql`${table.provider} in (${literalList(MODEL_TEAM_PROVIDERS)})`,
    ),
    check(
      'model_team_questions_status_check',
      sql`${table.status} in (${literalList(Object.values(MODEL_TEAM_QUESTION_STATUS))})`,
    ),
    check(
      'model_team_questions_question_check',
      sql`char_length(${table.question}) between ${raw(MODEL_TEAM_QUESTION_MIN_LENGTH)} and ${raw(MODEL_TEAM_QUESTION_MAX_LENGTH)}`,
    ),
    check(
      'model_team_questions_answer_check',
      sql`char_length(${table.answer}) <= ${raw(MODEL_TEAM_ANSWER_MAX_LENGTH)}`,
    ),
    check(
      'model_team_questions_answered_check',
      sql`${table.status} not in ('answered', 'hidden') or ${table.answer} is not null`,
    ),
    check(
      'model_team_questions_failure_code_check',
      sql`${table.status} <> 'failed' or ${table.failureCode} is not null`,
    ),
  ];
}

// A pergunta livre de um usuário a uma equipe de modelo, numa simulação ao vivo dele (adendo da spec 015): dado do DONO. O texto
// vai ao provedor da equipe; a resposta volta em texto. O custo entra no MESMO teto diário e mensal dos relatórios.
export const modelTeamQuestions = pgTable(
  'model_team_questions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id').notNull(),
    teamKey: varchar('team_key', { length: 8 }).notNull(),
    provider: varchar('provider', { length: 16 }).notNull(),
    modelId: varchar('model_id', { length: MODEL_TEAM_MODEL_ID_MAX_LENGTH }),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    question: text('question').notNull(),
    status: varchar('status', { length: 8 }).notNull(),
    answer: text('answer'),
    failureCode: varchar('failure_code', { length: MODEL_TEAM_FAILURE_CODE_MAX_LENGTH }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    thinkingTokens: integer('thinking_tokens'),
    latencyMilliseconds: integer('latency_ms'),
    costUsd: numeric('cost_usd', NUMERIC_COST).notNull().default('0'),
    reservedUsd: numeric('reserved_usd', NUMERIC_COST).notNull().default('0'),
    attempt: smallint('attempt').notNull().default(0),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    requestedDay: date('requested_day', { mode: 'string' })
      .notNull()
      .default(sql`(now() at time zone 'UTC')::date`),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'model_team_questions_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    index('model_team_questions_pending')
      .on(table.requestedAt)
      .where(sql`${table.status} = ${literalList([MODEL_TEAM_QUESTION_STATUS.PENDING])}`),
    index('model_team_questions_run').on(table.runId, table.requestedAt.desc()),
    index('model_team_questions_user_day').on(table.userId, table.requestedDay),
    index('model_team_questions_day').on(table.requestedDay),
    ...buildQuestionChecks(table),
  ],
);
