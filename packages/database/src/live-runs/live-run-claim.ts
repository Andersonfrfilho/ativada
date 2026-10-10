// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import { readUserRunLimits } from '../run-queue/run-limits.js';
import { runs } from '../schema/runs.schema.js';
import { users } from '../schema/users.schema.js';
import type { ClaimedLiveRun, ClaimLiveRunsParams } from './live-run.types.js';

type Candidate = { readonly runId: string; readonly userId: string };
type Database = Pick<BunSQLDatabase, 'select' | 'transaction'>;

function isExpired(timeoutSeconds: number): ReturnType<typeof or> {
  return or(
    isNull(runs.heartbeatAt),
    sql`${runs.heartbeatAt} < now() - (${timeoutSeconds}::int * interval '1 second')`,
  );
}

// Disponível para reivindicar: ainda na fila, ou `running` sob um worker cujo batimento venceu (instância caída).
function isClaimable(timeoutSeconds: number): ReturnType<typeof or> {
  return or(
    eq(runs.status, RUN_STATUS.QUEUED),
    and(eq(runs.status, RUN_STATUS.RUNNING), isExpired(timeoutSeconds)),
  );
}

async function listCandidates(
  database: Pick<BunSQLDatabase, 'select'>,
  timeoutSeconds: number,
): Promise<readonly Candidate[]> {
  return database
    .select({ runId: runs.id, userId: runs.userId })
    .from(runs)
    .innerJoin(users, eq(users.id, runs.userId))
    .where(
      and(
        eq(runs.kind, RUN_KIND.LIVE_PAPER),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
        isClaimable(timeoutSeconds),
      ),
    )
    .orderBy(asc(runs.createdAt), asc(runs.id));
}

// UMA tentativa por transação. O lock do usuário (`NO KEY UPDATE`) serializa quem reivindica para o mesmo dono, então a
// contagem de ativas é a verdadeira; `SKIP LOCKED` faz o outro worker seguir em frente em vez de esperar.
async function tryClaim(
  database: Pick<BunSQLDatabase, 'transaction'>,
  candidate: Candidate,
  params: ClaimLiveRunsParams,
): Promise<ClaimedLiveRun | undefined> {
  return database.transaction(async (transaction) => {
    const owner = await transaction
      .select({ limits: users.limits })
      .from(users)
      .where(and(eq(users.id, candidate.userId), isNull(users.deletedAt), isNull(users.blockedAt)))
      .for('no key update', { skipLocked: true });
    if (owner[0] === undefined) return undefined;
    const held = await transaction
      .select({ total: sql<number>`count(*)::int` })
      .from(runs)
      .where(
        and(
          eq(runs.userId, candidate.userId),
          eq(runs.kind, RUN_KIND.LIVE_PAPER),
          eq(runs.status, RUN_STATUS.RUNNING),
          isNotNull(runs.heartbeatAt),
          sql`not (${isExpired(params.heartbeatTimeoutSeconds)})`,
          ne(runs.id, candidate.runId),
        ),
      );
    const { maxActiveLivePaperRuns } = readUserRunLimits(owner[0].limits);
    if ((held[0]?.total ?? 0) >= maxActiveLivePaperRuns) return undefined;
    return takeRun(transaction, candidate, params);
  });
}

async function takeRun(
  transaction: Pick<BunSQLDatabase, 'select' | 'update'>,
  candidate: Candidate,
  params: ClaimLiveRunsParams,
): Promise<ClaimedLiveRun | undefined> {
  const claimable = and(
    eq(runs.id, candidate.runId),
    eq(runs.kind, RUN_KIND.LIVE_PAPER),
    isClaimable(params.heartbeatTimeoutSeconds),
  );
  const locked = await transaction
    .select({ status: runs.status })
    .from(runs)
    .where(claimable)
    .for('update', { skipLocked: true });
  const previous = locked[0];
  if (previous === undefined) return undefined;
  await transaction
    .update(runs)
    .set({
      status: RUN_STATUS.RUNNING,
      claimedBy: params.claimedBy,
      heartbeatAt: sql`now()`,
      startedAt: sql`coalesce(${runs.startedAt}, now())`,
    })
    .where(eq(runs.id, candidate.runId));
  return { runId: candidate.runId, isTakeover: previous.status === RUN_STATUS.RUNNING };
}

export async function claimLiveRuns(
  database: Database & Pick<BunSQLDatabase, 'update'>,
  params: ClaimLiveRunsParams,
): Promise<readonly ClaimedLiveRun[]> {
  const claimed: ClaimedLiveRun[] = [];
  for (const candidate of await listCandidates(database, params.heartbeatTimeoutSeconds)) {
    const taken = await tryClaim(database, candidate, params);
    if (taken !== undefined) claimed.push(taken);
  }
  return claimed;
}
