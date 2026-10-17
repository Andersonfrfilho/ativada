// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import {
  CANDLE_DURATION_15M_MILLISECONDS,
  MILLISECONDS_PER_MINUTE,
  MODEL_TEAM_ATTEMPTS_EXHAUSTED_CODE,
  MODEL_TEAM_CLAIM_MAXIMUM_BATCH,
  MODEL_TEAM_MAXIMUM_ATTEMPTS,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
} from './model-team.constant.js';
import type {
  ClaimedTeamReport,
  ClaimTeamReportsParams,
  EnqueueTeamReportsParams,
  TeamReportSlot,
} from './team-report.types.js';

const PROMPT_VERSION = 'team-prompt-1';
const TIMEFRAME = '15m';

type ClaimRow = {
  readonly id: string;
  readonly team_key: string;
  readonly provider: string;
  readonly model_id: string;
  readonly kind: string;
  readonly symbol: string;
  readonly candle_time: string | number;
  readonly attempt: number;
  readonly requested_at: string | Date;
};

// A vela só gera relatório se o FECHAMENTO (abertura + 15 min) cai na grade do ritmo; sem ritmo na grade, nada nasce.
function isOnCadence(params: EnqueueTeamReportsParams): boolean {
  const closeTime = params.candleTime + CANDLE_DURATION_15M_MILLISECONDS;
  return closeTime % (params.cadenceMinutes * MILLISECONDS_PER_MINUTE) === 0;
}

async function enqueueOne(
  executor: DatabaseExecutor,
  params: EnqueueTeamReportsParams & { readonly team: TeamReportSlot },
): Promise<number> {
  const { team } = params;
  // Só nasce se algum dono ATIVO ligou a equipe e tem uma simulação ao vivo rodando nesse par.
  const inserted = await executor.execute(sql`
    INSERT INTO model_team_reports
      (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status)
    SELECT ${Bun.randomUUIDv7()}::uuid, ${team.teamKey}, ${team.provider}, ${team.modelId}, ${PROMPT_VERSION},
      ${MODEL_TEAM_REPORT_KIND.SCHEDULED}, ${params.symbol}, ${TIMEFRAME}, ${params.candleTime},
      ${MODEL_TEAM_REPORT_STATUS.PENDING}
    WHERE EXISTS (
      SELECT 1 FROM user_model_teams t
        JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL AND u.blocked_at IS NULL
        JOIN runs r ON r.user_id = t.user_id
      WHERE t.team_key = ${team.teamKey} AND t.enabled
        AND r.kind = 'live_paper' AND r.status = 'running' AND r.deleted_at IS NULL
        AND r.symbol = ${params.symbol})
    ON CONFLICT (team_key, symbol, timeframe, candle_time, prompt_version) WHERE kind = 'scheduled' DO NOTHING
    RETURNING 1`);
  return inserted.length;
}

export async function enqueueReports(
  executor: DatabaseExecutor,
  params: EnqueueTeamReportsParams,
): Promise<number> {
  if (!isOnCadence(params)) return 0;
  const counts = await Promise.all(
    params.teams.map((team) => enqueueOne(executor, { ...params, team })),
  );
  return counts.reduce((total, count) => total + count, 0);
}

function toClaimed(row: ClaimRow): ClaimedTeamReport {
  return {
    id: row.id,
    teamKey: row.team_key,
    provider: row.provider,
    modelId: row.model_id,
    kind: row.kind,
    symbol: row.symbol,
    candleTime: Number(row.candle_time),
    attempt: row.attempt,
    requestedAt: new Date(row.requested_at),
  };
}

// Linha cujo arrendamento venceu volta sozinha (continua `pending`); a que já gastou as tentativas encerra como falha.
export async function claimReports(
  executor: DatabaseExecutor,
  params: ClaimTeamReportsParams,
): Promise<readonly ClaimedTeamReport[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), MODEL_TEAM_CLAIM_MAXIMUM_BATCH);
  const now = params.now.toISOString();
  const leaseUntil = new Date(params.now.getTime() + params.leaseMilliseconds).toISOString();
  await executor.execute(sql`
    UPDATE model_team_reports SET status = ${MODEL_TEAM_REPORT_STATUS.FAILED}, lease_until = NULL, reserved_usd = 0,
      failure_code = ${MODEL_TEAM_ATTEMPTS_EXHAUSTED_CODE}
    WHERE status = ${MODEL_TEAM_REPORT_STATUS.PENDING} AND attempt >= ${MODEL_TEAM_MAXIMUM_ATTEMPTS}
      AND (lease_until IS NULL OR lease_until <= ${now}::timestamptz)`);
  const rows: unknown = await executor.execute(sql`
    UPDATE model_team_reports SET lease_until = ${leaseUntil}::timestamptz, attempt = attempt + 1
    WHERE id IN (
      SELECT id FROM model_team_reports
      WHERE status = ${MODEL_TEAM_REPORT_STATUS.PENDING}
        AND (lease_until IS NULL OR lease_until <= ${now}::timestamptz)
      ORDER BY requested_at, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, team_key, provider, model_id, kind, symbol, candle_time, attempt, requested_at`);
  return Array.isArray(rows) ? (rows as readonly ClaimRow[]).map(toClaimed) : [];
}
