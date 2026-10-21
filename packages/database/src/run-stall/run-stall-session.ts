// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

import { ALERT_SIDE } from '../alerts/alert.constant.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import { runs } from '../schema/runs.schema.js';
import { enqueueStallAlert, notifyStallChange } from './run-stall-alert.js';
import { STALL_SWEEP_LOCK_KEY } from './run-stall.constant.js';
import type {
  CloseStallEpisodeParams,
  OpenStallEpisodeParams,
  StallCandidate,
  StallSession,
} from './run-stall.types.js';

const isRunningLiveRun = and(
  eq(runs.kind, RUN_KIND.LIVE_PAPER),
  eq(runs.status, RUN_STATUS.RUNNING),
  isNull(runs.deletedAt),
);

type AcquireRow = { readonly acquired: boolean };

async function tryAcquireLock(executor: DatabaseExecutor): Promise<boolean> {
  const rows: unknown = await executor.execute(
    sql`SELECT pg_try_advisory_xact_lock(${STALL_SWEEP_LOCK_KEY}::bigint) AS acquired`,
  );
  return Array.isArray(rows) && (rows[0] as AcquireRow | undefined)?.acquired === true;
}

async function listCandidates(executor: DatabaseExecutor): Promise<readonly StallCandidate[]> {
  const rows = await executor
    .select({
      runId: runs.id,
      symbol: runs.symbol,
      timeframe: runs.timeframe,
      periodStart: runs.periodStart,
      lastCandleTime: runs.lastCandleTime,
      waitingSince: runs.waitingSince,
      stalledSince: runs.stalledSince,
    })
    .from(runs)
    .where(isRunningLiveRun)
    .orderBy(runs.id);
  return rows.map((row) => ({
    runId: row.runId,
    symbol: row.symbol,
    timeframe: row.timeframe,
    periodStart: row.periodStart,
    lastCandleTime: row.lastCandleTime ?? undefined,
    isWaitingForData: row.waitingSince !== null,
    stalledSince: row.stalledSince ?? undefined,
  }));
}

// O `last_candle_time` lido tem de ser o de agora: se o worker andou entre a leitura e a gravação, a regra é refeita na ronda seguinte.
async function openEpisode(
  executor: DatabaseExecutor,
  params: OpenStallEpisodeParams,
): Promise<boolean> {
  const { candidate, stalledSince } = params;
  const rows = await executor
    .update(runs)
    .set({ stalledSince })
    .where(
      and(
        eq(runs.id, candidate.runId),
        isRunningLiveRun,
        isNull(runs.stalledSince),
        sql`${runs.lastCandleTime} is not distinct from ${candidate.lastCandleTime ?? null}::bigint`,
      ),
    )
    .returning({ userId: runs.userId });
  const row = rows[0];
  if (row === undefined) return false;
  await enqueueStallAlert(executor, {
    userId: row.userId,
    runId: candidate.runId,
    stalledSince,
    side: ALERT_SIDE.STALL,
    payload: params.alertPayload,
  });
  await notifyStallChange(executor, { runId: candidate.runId, stalledSince });
  return true;
}

async function closeEpisode(
  executor: DatabaseExecutor,
  params: CloseStallEpisodeParams,
): Promise<boolean> {
  const { candidate } = params;
  const stalledSince = candidate.stalledSince;
  if (stalledSince === undefined) return false;
  const rows = await executor
    .update(runs)
    .set({ stalledSince: null })
    .where(and(eq(runs.id, candidate.runId), isRunningLiveRun, eq(runs.stalledSince, stalledSince)))
    .returning({ userId: runs.userId });
  const row = rows[0];
  if (row === undefined) return false;
  await enqueueStallAlert(executor, {
    userId: row.userId,
    runId: candidate.runId,
    stalledSince,
    side: ALERT_SIDE.RESUME,
    payload: params.alertPayload,
  });
  await notifyStallChange(executor, { runId: candidate.runId, stalledSince });
  return true;
}

async function clearInactiveEpisodes(executor: DatabaseExecutor): Promise<number> {
  const rows = await executor
    .update(runs)
    .set({ stalledSince: null })
    .where(
      and(
        isNotNull(runs.stalledSince),
        or(
          ne(runs.status, RUN_STATUS.RUNNING),
          ne(runs.kind, RUN_KIND.LIVE_PAPER),
          isNotNull(runs.deletedAt),
        ),
      ),
    )
    .returning({ id: runs.id });
  return rows.length;
}

export function createStallSession(executor: DatabaseExecutor): StallSession {
  return {
    tryAcquireLock: () => tryAcquireLock(executor),
    listCandidates: () => listCandidates(executor),
    openEpisode: (params) => openEpisode(executor, params),
    closeEpisode: (params) => closeEpisode(executor, params),
    clearInactiveEpisodes: () => clearInactiveEpisodes(executor),
  };
}
