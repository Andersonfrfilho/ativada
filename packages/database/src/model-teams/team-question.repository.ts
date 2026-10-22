// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import {
  MODEL_TEAM_QUESTION_LIST_MAXIMUM,
  MODEL_TEAM_QUESTION_STATUS,
  type ModelTeamQuestionStatus,
} from './model-team.constant.js';
import type {
  CreateTeamQuestionParams,
  TeamQuestionRepository,
  TeamQuestionRow,
} from './team-question.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

// Espaço da trava consultiva por usuário (a chave de dois inteiros: este número e o hash do id do dono).
const QUESTION_LOCK_NAMESPACE = 15_030;
const TODAY_UTC = sql`(now() AT TIME ZONE 'UTC')::date`;

type QuestionRecord = {
  readonly id: string;
  readonly team_key: string;
  readonly symbol: string;
  readonly question: string;
  readonly status: ModelTeamQuestionStatus;
  readonly answer: string | null;
  readonly failure_code: string | null;
  readonly cost_usd: string;
  readonly requested_at: string | Date;
  readonly decided_at: string | Date | null;
};

function toRow(record: QuestionRecord): TeamQuestionRow {
  return {
    id: record.id,
    teamKey: record.team_key,
    symbol: record.symbol,
    question: record.question,
    status: record.status,
    answer: record.answer,
    failureCode: record.failure_code,
    costUsd: record.cost_usd,
    requestedAt: new Date(record.requested_at).getTime(),
    decidedAt: record.decided_at === null ? null : new Date(record.decided_at).getTime(),
  };
}

// O teto é do USUÁRIO no dia (soma das equipes e das simulações): a trava por dono serializa a contagem e a gravação, então dois
// pedidos simultâneos nunca passam juntos do teto. A FK composta `(run_id, user_id)` garante que a execução é do dono.
async function createQuestion(
  database: Database,
  scope: OwnerScope,
  params: CreateTeamQuestionParams,
): Promise<string | undefined> {
  if (params.dailyLimit <= 0) return undefined;
  const id = Bun.randomUUIDv7();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(${QUESTION_LOCK_NAMESPACE}::int, hashtext(${scope.ownerUserId}))`,
    );
    const inserted = await transaction.execute(sql`
      INSERT INTO model_team_questions (id, user_id, run_id, team_key, provider, symbol, question, status)
      SELECT ${id}::uuid, ${scope.ownerUserId}::uuid, ${params.runId}::uuid, ${params.teamKey}, ${params.provider},
        ${params.symbol}, ${params.question}, ${MODEL_TEAM_QUESTION_STATUS.PENDING}
      WHERE (SELECT count(*) FROM model_team_questions
             WHERE user_id = ${scope.ownerUserId}::uuid AND requested_day = ${TODAY_UTC}) < ${params.dailyLimit}
      RETURNING 1`);
    return inserted.length > 0 ? id : undefined;
  });
}

async function listQuestions(
  database: Database,
  scope: OwnerScope,
  params: { readonly runId: string; readonly limit: number },
): Promise<readonly TeamQuestionRow[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), MODEL_TEAM_QUESTION_LIST_MAXIMUM);
  const rows: unknown = await database.execute(sql`
    SELECT id, team_key, symbol, question, status, answer, failure_code, cost_usd::text AS cost_usd,
      requested_at, decided_at
    FROM model_team_questions
    WHERE user_id = ${scope.ownerUserId}::uuid AND run_id = ${params.runId}::uuid
    ORDER BY requested_at DESC, id DESC LIMIT ${limit}`);
  return Array.isArray(rows) ? (rows as readonly QuestionRecord[]).map(toRow) : [];
}

export function createTeamQuestionRepository(handle: DatabaseHandle): TeamQuestionRepository {
  const { database } = readOpenDatabase(handle);
  return {
    createQuestion: (scope, params) => createQuestion(database, scope, params),
    listQuestions: (scope, params) => listQuestions(database, scope, params),
  };
}
