// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { MODEL_TEAM_REPORT_KIND } from './model-team.constant.js';
import {
  asList,
  failureSection,
  latestSection,
  onDemandSection,
  PROMPT_VERSION,
  REPORT_COLUMNS,
  scoreSection,
  spendSection,
  TIMEFRAME,
} from './model-team-read-sql.js';
import type {
  ModelTeamOverview,
  ModelTeamReadRepository,
  ReadOverviewParams,
  TeamReportRow,
} from './model-team-read.types.js';

type RawReport = {
  readonly id: string;
  readonly team_key: string;
  readonly kind: string;
  readonly candle_time: string | number;
  readonly status: string;
  readonly failure_code: string | null;
  readonly action: string | null;
  readonly entry_price: string | null;
  readonly target_price: string | null;
  readonly stop_price: string | null;
  readonly confidence: number | null;
  readonly roles: unknown;
  readonly reason_hidden: boolean;
  readonly latency_ms: number | null;
  readonly cost_usd: string;
  readonly requested_at: string | Date;
  readonly decided_at: string | Date | null;
};

type RawOverview = {
  readonly latest: readonly RawReport[];
  readonly on_demand: readonly RawReport[];
  readonly scores: readonly {
    readonly team_key: string;
    readonly hits: number;
    readonly misses: number;
    readonly ties: number;
  }[];
  readonly spend: readonly {
    readonly team_key: string;
    readonly day_usd: string;
    readonly month_usd: string;
  }[];
  readonly failures: readonly {
    readonly team_key: string;
    readonly total: number;
    readonly failed: number;
  }[];
};

const EMPTY_OVERVIEW: ModelTeamOverview = {
  latest: [],
  onDemand: [],
  scores: [],
  spend: [],
  failures: [],
};

function toReportRow(row: RawReport): TeamReportRow {
  return {
    id: row.id,
    teamKey: row.team_key,
    kind: row.kind,
    candleTime: Number(row.candle_time),
    status: row.status,
    failureCode: row.failure_code,
    action: row.action,
    entryPrice: row.entry_price,
    targetPrice: row.target_price,
    stopPrice: row.stop_price,
    confidence: row.confidence,
    roles: row.roles,
    isReasonHidden: row.reason_hidden,
    latencyMilliseconds: row.latency_ms,
    costUsd: row.cost_usd,
    requestedAt: new Date(row.requested_at),
    decidedAt: row.decided_at === null ? null : new Date(row.decided_at),
  };
}

async function readOverview(
  executor: DatabaseExecutor,
  params: ReadOverviewParams,
): Promise<ModelTeamOverview> {
  const rows: unknown = await executor.execute(sql`
    SELECT jsonb_build_object(
      'latest', ${asList(latestSection(params))},
      'on_demand', ${asList(onDemandSection(params))},
      'scores', ${asList(scoreSection(params))},
      'spend', ${asList(spendSection())},
      'failures', ${asList(failureSection(params))}
    ) AS overview`);
  const first = Array.isArray(rows)
    ? (rows[0] as { readonly overview: RawOverview } | undefined)
    : undefined;
  if (first === undefined) return EMPTY_OVERVIEW;
  const raw = first.overview;
  return {
    latest: raw.latest.map(toReportRow),
    onDemand: raw.on_demand.map(toReportRow),
    scores: raw.scores.map((row) => ({
      teamKey: row.team_key,
      hits: row.hits,
      misses: row.misses,
      ties: row.ties,
    })),
    spend: raw.spend.map((row) => ({
      teamKey: row.team_key,
      dayUsd: row.day_usd,
      monthUsd: row.month_usd,
    })),
    failures: raw.failures.map((row) => ({
      teamKey: row.team_key,
      total: row.total,
      failed: row.failed,
    })),
  };
}

async function listReportsForCandles(
  executor: DatabaseExecutor,
  params: { readonly symbol: string; readonly candleTimes: readonly number[] },
): Promise<readonly TeamReportRow[]> {
  if (params.candleTimes.length === 0) return [];
  const times = sql.join(
    params.candleTimes.map((time) => sql`${time}`),
    sql`, `,
  );
  const rows: unknown = await executor.execute(sql`
    SELECT ${REPORT_COLUMNS} FROM model_team_reports r
    WHERE r.symbol = ${params.symbol} AND r.timeframe = ${TIMEFRAME} AND r.prompt_version = ${PROMPT_VERSION}
      AND r.kind = ${MODEL_TEAM_REPORT_KIND.SCHEDULED} AND r.candle_time IN (${times})`);
  return (Array.isArray(rows) ? (rows as readonly RawReport[]) : []).map(toReportRow);
}

// Dado público como `candles` (sem `user_id`): o repositório não pede `OwnerScope`; quem chama já provou que a execução é do dono.
export function createModelTeamReadRepository(handle: DatabaseHandle): ModelTeamReadRepository {
  const { database } = readOpenDatabase(handle);
  return {
    readOverview: (params) => readOverview(database, params),
    listReportsForCandles: (params) => listReportsForCandles(database, params),
  };
}
