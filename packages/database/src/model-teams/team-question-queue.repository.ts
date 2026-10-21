// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import {
  MODEL_TEAM_ANSWER_MAX_LENGTH,
  MODEL_TEAM_ATTEMPTS_EXHAUSTED_CODE,
  MODEL_TEAM_CLAIM_MAXIMUM_BATCH,
  MODEL_TEAM_MAXIMUM_ATTEMPTS,
  MODEL_TEAM_QUESTION_STATUS,
} from './model-team.constant.js';
import { BUDGET_LOCK_KEY, readUsage } from './team-report-write.js';
import type {
  ClaimedTeamQuestion,
  ClaimTeamQuestionsParams,
  FinishTeamQuestionParams,
  TeamQuestionQueueRepository,
} from './team-question.types.js';

const PENDING = MODEL_TEAM_QUESTION_STATUS.PENDING;

type ClaimRecord = {
  readonly id: string;
  readonly team_key: string;
  readonly symbol: string;
  readonly question: string;
  readonly attempt: number;
};

// A mesma fila dos relatórios (arrendamento + `SKIP LOCKED`): arrendamento vencido volta sozinho; tentativas gastas = falha.
async function claimQuestions(
  executor: DatabaseExecutor,
  params: ClaimTeamQuestionsParams,
): Promise<readonly ClaimedTeamQuestion[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), MODEL_TEAM_CLAIM_MAXIMUM_BATCH);
  const now = params.now.toISOString();
  const leaseUntil = new Date(params.now.getTime() + params.leaseMilliseconds).toISOString();
  await executor.execute(sql`
    UPDATE model_team_questions SET status = ${MODEL_TEAM_QUESTION_STATUS.FAILED}, lease_until = NULL, reserved_usd = 0,
      failure_code = ${MODEL_TEAM_ATTEMPTS_EXHAUSTED_CODE}, decided_at = now()
    WHERE status = ${PENDING} AND attempt >= ${MODEL_TEAM_MAXIMUM_ATTEMPTS}
      AND (lease_until IS NULL OR lease_until <= ${now}::timestamptz)`);
  const rows: unknown = await executor.execute(sql`
    UPDATE model_team_questions SET lease_until = ${leaseUntil}::timestamptz, attempt = attempt + 1
    WHERE id IN (
      SELECT id FROM model_team_questions
      WHERE status = ${PENDING} AND (lease_until IS NULL OR lease_until <= ${now}::timestamptz)
      ORDER BY requested_at, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, team_key, symbol, question, attempt`);
  const records = Array.isArray(rows) ? (rows as readonly ClaimRecord[]) : [];
  return records.map((record) => ({
    id: record.id,
    teamKey: record.team_key,
    symbol: record.symbol,
    question: record.question,
    attempt: record.attempt,
  }));
}

async function finishQuestion(
  executor: DatabaseExecutor,
  params: FinishTeamQuestionParams,
): Promise<void> {
  const { measure } = params;
  const answer = params.answer?.slice(0, MODEL_TEAM_ANSWER_MAX_LENGTH) ?? null;
  await executor.execute(sql`
    UPDATE model_team_questions SET
      status = ${params.status}, lease_until = NULL, reserved_usd = 0, cost_usd = ${params.costUsd}::numeric,
      model_id = COALESCE(${params.modelId ?? null}, model_id), answer = ${answer},
      failure_code = ${params.failureCode ?? null}, input_tokens = ${measure.inputTokens ?? null},
      output_tokens = ${measure.outputTokens ?? null}, thinking_tokens = ${measure.thinkingTokens ?? null},
      latency_ms = ${measure.latencyMilliseconds ?? null}, decided_at = now()
    WHERE id = ${params.questionId} AND status = ${PENDING}`);
}

// Dado do dono, mas tratado pela fila sem escopo (como os alertas e os relatórios): o worker só lê o texto e grava o desfecho.
export function createTeamQuestionQueueRepository(
  handle: DatabaseHandle,
): TeamQuestionQueueRepository {
  const { database } = readOpenDatabase(handle);
  return {
    claimPending: (params) =>
      database.transaction((transaction) => claimQuestions(transaction, params)),
    // A decisão e a reserva sob a MESMA trava dos relatórios: o teto é um só.
    reserveBudget: (params) =>
      database.transaction(async (transaction) => {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(${BUDGET_LOCK_KEY}::bigint)`);
        const usage = await readUsage(transaction);
        if (!params.isAllowed(usage)) return { usage, isReserved: false };
        await transaction.execute(sql`
          UPDATE model_team_questions SET reserved_usd = ${params.reservationUsd}::numeric WHERE id = ${params.questionId}`);
        return { usage, isReserved: true };
      }),
    finish: (params) => finishQuestion(database, params),
    expireQuestions: async (params): Promise<number> => {
      const deleted = await database.execute(sql`
        DELETE FROM model_team_questions
        WHERE status <> ${PENDING} AND requested_at < now() - make_interval(days => ${params.olderThanDays})
        RETURNING 1`);
      return deleted.length;
    },
  };
}
