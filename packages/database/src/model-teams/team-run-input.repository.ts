// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { teamRunInputs } from '../schema/team-run-inputs.schema.js';
import {
  MODEL_TEAM_PROMPT_VERSIONS,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
  MODEL_TEAM_TIMEFRAMES,
} from './model-team.constant.js';
import type {
  LookupScheduledReportParams,
  ReadTeamRunInputParams,
  ScheduledReportLookup,
  StoredTeamRunInput,
  TeamReportView,
  TeamRunInputRepository,
  TeamRunInputWrite,
} from './team-run-input.types.js';

type ReportRow = {
  readonly id: string | null;
  readonly status: string | null;
  readonly failure_code: string | null;
  readonly action: string | null;
  readonly entry_price: string | null;
  readonly target_price: string | null;
  readonly stop_price: string | null;
  readonly confidence: number | null;
  readonly roles: unknown;
  readonly is_in_time: boolean | null;
  readonly is_past_deadline: boolean;
};

const REPORT_COLUMNS = sql`r.id, r.status, r.failure_code, r.action, r.entry_price::text AS entry_price,
  r.target_price::text AS target_price, r.stop_price::text AS stop_price, r.confidence, r.roles`;

function toReportView(row: ReportRow): TeamReportView | undefined {
  if (row.id === null || row.status === null) return undefined;
  const isDecided = row.status === MODEL_TEAM_REPORT_STATUS.DECIDED;
  return {
    id: row.id,
    status: row.status,
    failureCode: row.failure_code,
    isDecidedInTime: row.is_in_time === true,
    decision:
      isDecided && row.action !== null && row.confidence !== null
        ? {
            action: row.action,
            entryPrice: row.entry_price,
            targetPrice: row.target_price,
            stopPrice: row.stop_price,
            confidence: row.confidence,
            roles: row.roles,
          }
        : undefined,
  };
}

function readRows(rows: unknown): readonly ReportRow[] {
  return Array.isArray(rows) ? (rows as readonly ReportRow[]) : [];
}

// A execução de equipe grava a entrada de cada vela NA transação do passo (ver `RunBatchWriter.appendTeamRunInput`).
export async function insertTeamRunInput(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: TeamRunInputWrite & { readonly runId: string },
): Promise<boolean> {
  const inserted = await executor
    .insert(teamRunInputs)
    .values({
      runId: params.runId,
      candleTime: params.candleTime,
      userId: scope.ownerUserId,
      reportId: params.reportId,
      failureCode: params.failureCode,
      appliedAction: params.appliedAction,
    })
    .onConflictDoNothing({ target: [teamRunInputs.runId, teamRunInputs.candleTime] })
    .returning({ runId: teamRunInputs.runId });
  return inserted.length > 0;
}

type Database = ReturnType<typeof readOpenDatabase>['database'];

async function readStoredInput(
  database: Database,
  scope: OwnerScope,
  params: ReadTeamRunInputParams,
): Promise<StoredTeamRunInput | undefined> {
  const rows = await database
    .select({
      reportId: teamRunInputs.reportId,
      failureCode: teamRunInputs.failureCode,
      appliedAction: teamRunInputs.appliedAction,
    })
    .from(teamRunInputs)
    .where(
      and(
        ownerCondition(scope, teamRunInputs.userId),
        eq(teamRunInputs.runId, params.runId),
        eq(teamRunInputs.candleTime, params.candleTime),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row === undefined || row.appliedAction === null
    ? undefined
    : { ...row, appliedAction: row.appliedAction };
}

async function readReportById(
  database: Database,
  reportId: string,
): Promise<TeamReportView | undefined> {
  const rows: unknown = await database.execute(sql`
    SELECT ${REPORT_COLUMNS}, true AS is_in_time, false AS is_past_deadline
    FROM model_team_reports r WHERE r.id = ${reportId}::uuid`);
  const row = readRows(rows)[0];
  return row === undefined ? undefined : toReportView(row);
}

async function lookupScheduledReport(
  database: Database,
  params: LookupScheduledReportParams,
): Promise<ScheduledReportLookup> {
  const [promptVersion] = MODEL_TEAM_PROMPT_VERSIONS;
  const [timeframe] = MODEL_TEAM_TIMEFRAMES;
  const rows: unknown = await database.execute(sql`
    SELECT ${REPORT_COLUMNS},
      (r.decided_at IS NOT NULL AND r.decided_at <= to_timestamp(${params.deadlineAt}::bigint / 1000.0)) AS is_in_time,
      (clock_timestamp() > to_timestamp(${params.deadlineAt}::bigint / 1000.0)) AS is_past_deadline
    FROM (SELECT 1) AS one
    LEFT JOIN model_team_reports r ON r.team_key = ${params.teamKey} AND r.symbol = ${params.symbol}
      AND r.timeframe = ${timeframe} AND r.candle_time = ${params.candleTime}
      AND r.prompt_version = ${promptVersion} AND r.kind = ${MODEL_TEAM_REPORT_KIND.SCHEDULED}`);
  const row = readRows(rows)[0];
  if (row === undefined) return { isPastDeadline: false, report: undefined };
  return { isPastDeadline: row.is_past_deadline, report: toReportView(row) };
}

export function createTeamRunInputRepository(handle: DatabaseHandle): TeamRunInputRepository {
  const { database } = readOpenDatabase(handle);
  return {
    readStoredInput: (scope, params) => readStoredInput(database, scope, params),
    readReportById: (reportId) => readReportById(database, reportId),
    lookupScheduledReport: (params) => lookupScheduledReport(database, params),
  };
}
