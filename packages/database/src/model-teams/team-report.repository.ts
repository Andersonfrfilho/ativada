// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { claimReports, enqueueReports } from './team-report-queue.js';
import { finishReport, reserveBudget, saveInput } from './team-report-write.js';
import type { PublicReadings, TeamReportRepository } from './team-report.types.js';

type ReadingsRow = { readonly readings: Record<string, unknown> | null };

const READING_KEYS = [
  'relativeVolume',
  'atrRate',
  'atrPercentile90',
  'atrPercentile95',
  'momentumShort',
  'momentumLong',
] as const;

function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function toPublicReadings(source: Record<string, unknown>): PublicReadings {
  const [relativeVolume, atrRate, atrPercentile90, atrPercentile95, momentumShort, momentumLong] =
    READING_KEYS.map((key) => readText(source, key));
  return {
    relativeVolume: relativeVolume ?? null,
    atrRate: atrRate ?? null,
    atrPercentile90: atrPercentile90 ?? null,
    atrPercentile95: atrPercentile95 ?? null,
    momentumShort: momentumShort ?? null,
    momentumLong: momentumLong ?? null,
  };
}

// Dado operacional e PÚBLICO (sem `user_id`, como `candles`): por isso o repositório não pede `OwnerScope`.
export function createTeamReportRepository(handle: DatabaseHandle): TeamReportRepository {
  const { database } = readOpenDatabase(handle);
  return {
    enqueueTeamReports: (params) =>
      database.transaction((transaction) => enqueueReports(transaction, params)),
    claimPending: (params) =>
      database.transaction((transaction) => claimReports(transaction, params)),
    // As leituras são iguais entre simulações do par (ADR A3): qualquer linha decidida daquela vela serve.
    readPublicReadings: async (params): Promise<PublicReadings | undefined> => {
      const rows: unknown = await database.execute(sql`
        SELECT d.readings FROM analyst_decisions d JOIN runs r ON r.id = d.run_id
        WHERE r.symbol = ${params.symbol} AND r.timeframe = '15m' AND d.candle_time = ${params.candleTime}
          AND d.status = 'decided' AND d.readings IS NOT NULL
        ORDER BY d.created_at LIMIT 1`);
      const row = Array.isArray(rows) ? (rows as readonly ReadingsRow[])[0] : undefined;
      return row?.readings == null ? undefined : toPublicReadings(row.readings);
    },
    saveInput: (params) => saveInput(database, params),
    reserveBudget: (params) => reserveBudget(database, params),
    finish: (params) => finishReport(database, params),
    expireReports: async (params): Promise<number> => {
      const deleted = await database.execute(sql`
        DELETE FROM model_team_reports r
        WHERE r.status <> 'pending' AND r.requested_at < now() - make_interval(days => ${params.olderThanDays})
          AND NOT EXISTS (SELECT 1 FROM team_run_inputs i WHERE i.report_id = r.id)
        RETURNING 1`);
      return deleted.length;
    },
  };
}
