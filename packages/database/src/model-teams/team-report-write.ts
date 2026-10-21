// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import {
  MODEL_TEAM_RAW_OUTPUT_MAX_LENGTH,
  MODEL_TEAM_REPORT_STATUS,
} from './model-team.constant.js';
import type {
  FinishTeamReportParams,
  ReserveBudgetParams,
  ReserveBudgetResult,
  SaveReportInputParams,
  SpendUsage,
} from './team-report.types.js';

// Chave da trava consultiva do teto de custo: uma só para a instalação inteira (as instâncias do worker disputam a mesma).
const BUDGET_LOCK_KEY = 15_015_015;

type UsageRow = { readonly day_usd: string; readonly month_usd: string };

export async function saveInput(
  executor: DatabaseExecutor,
  params: SaveReportInputParams,
): Promise<void> {
  await executor.execute(sql`
    UPDATE model_team_reports SET input = ${toJsonb(params.input)}, prompt_hash = ${params.promptHash},
      model_id = COALESCE(${params.modelId ?? null}, model_id)
    WHERE id = ${params.reportId}`);
}

// Soma exata do que já foi gravado e do que está reservado em voo: dia e mês em UTC, pelo relógio do banco.
async function readUsage(executor: DatabaseExecutor): Promise<SpendUsage> {
  const rows: unknown = await executor.execute(sql`
    SELECT
      COALESCE(SUM(cost_usd + reserved_usd) FILTER (WHERE requested_day = (now() AT TIME ZONE 'UTC')::date), 0)::text AS day_usd,
      COALESCE(SUM(cost_usd + reserved_usd), 0)::text AS month_usd
    FROM model_team_reports
    WHERE requested_day >= date_trunc('month', now() AT TIME ZONE 'UTC')::date`);
  const row = Array.isArray(rows) ? (rows as readonly UsageRow[])[0] : undefined;
  return { dayUsd: row?.day_usd ?? '0', monthUsd: row?.month_usd ?? '0' };
}

// A decisão e a reserva acontecem sob a MESMA trava: duas instâncias nunca passam do teto juntas.
export async function reserveBudget(
  database: Pick<BunSQLDatabase, 'transaction'>,
  params: ReserveBudgetParams,
): Promise<ReserveBudgetResult> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${BUDGET_LOCK_KEY}::bigint)`);
    const usage = await readUsage(transaction);
    if (!params.isAllowed(usage)) return { usage, isReserved: false };
    await transaction.execute(sql`
      UPDATE model_team_reports SET reserved_usd = ${params.reservationUsd}::numeric WHERE id = ${params.reportId}`);
    return { usage, isReserved: true };
  });
}

export async function finishReport(
  executor: DatabaseExecutor,
  params: FinishTeamReportParams,
): Promise<void> {
  const { decision, measure } = params;
  const decidedAt = params.status === MODEL_TEAM_REPORT_STATUS.DECIDED ? sql`now()` : sql`NULL`;
  const rawOutput = params.rawOutput?.slice(0, MODEL_TEAM_RAW_OUTPUT_MAX_LENGTH) ?? null;
  const roles = decision === undefined ? sql`NULL` : toJsonb(decision.roles);
  await executor.execute(sql`
    UPDATE model_team_reports SET
      status = ${params.status}, lease_until = NULL, reserved_usd = 0, cost_usd = ${params.costUsd}::numeric,
      action = ${decision?.action ?? null}, entry_price = ${decision?.entryPrice ?? null}::numeric,
      target_price = ${decision?.targetPrice ?? null}::numeric, stop_price = ${decision?.stopPrice ?? null}::numeric,
      confidence = ${decision?.confidence ?? null}, roles = ${roles},
      reason_hidden = ${decision?.isReasonHidden ?? false}, raw_output = ${rawOutput},
      input_tokens = ${measure.inputTokens ?? null}, output_tokens = ${measure.outputTokens ?? null},
      thinking_tokens = ${measure.thinkingTokens ?? null}, latency_ms = ${measure.latencyMilliseconds ?? null},
      failure_code = ${params.failureCode ?? null}, decided_at = ${decidedAt}
    WHERE id = ${params.reportId} AND status = ${MODEL_TEAM_REPORT_STATUS.PENDING}`);
}
