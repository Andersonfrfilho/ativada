// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { RUN_STATUS, type RunKind } from '../runs/run.constant.js';
import { runs } from '../schema/runs.schema.js';
import { users } from '../schema/users.schema.js';
import { compareClaimCandidates, hasCapacity, type ClaimCandidate } from './claim-policy.js';
import { readUserRunLimits } from './run-limits.js';
import { CLAIMABLE_RUN_KINDS } from './run-queue.constant.js';
import type { ClaimedRun, ClaimNextRunParams } from './run-queue.types.js';

const MICROSECONDS_PER_SECOND = 1_000_000;

function epochMicros(column: unknown): ReturnType<typeof sql<string>> {
  return sql<string>`(extract(epoch from ${column}) * ${MICROSECONDS_PER_SECOND})::bigint::text`;
}

// A cabeça da fila de cada (usuário, tipo) entre as contas ativas, com o necessário para decidir quem é o próximo.
async function listClaimCandidates(
  executor: Pick<BunSQLDatabase, 'selectDistinctOn'>,
): Promise<readonly ClaimCandidate[]> {
  const rows = await executor
    .selectDistinctOn([runs.userId, runs.kind], {
      runId: runs.id,
      userId: runs.userId,
      kind: runs.kind,
      createdMicros: epochMicros(runs.createdAt),
      lastStartedMicros: sql<
        string | null
      >`(select (extract(epoch from max(served.started_at)) * ${MICROSECONDS_PER_SECOND})::bigint::text from runs served where served.user_id = ${runs.userId})`,
      runningOfKind: sql<number>`(select count(*)::int from runs active where active.user_id = ${runs.userId} and active.kind = ${runs.kind} and active.status = ${RUN_STATUS.RUNNING})`,
      limits: users.limits,
    })
    .from(runs)
    .innerJoin(users, eq(users.id, runs.userId))
    .where(
      and(
        eq(runs.status, RUN_STATUS.QUEUED),
        inArray(runs.kind, [...CLAIMABLE_RUN_KINDS]),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
      ),
    )
    .orderBy(runs.userId, runs.kind, asc(runs.createdAt), asc(runs.id));
  return rows.map((row) => ({
    runId: row.runId,
    userId: row.userId,
    kind: row.kind as RunKind,
    createdMicros: BigInt(row.createdMicros),
    lastStartedMicros: row.lastStartedMicros === null ? undefined : BigInt(row.lastStartedMicros),
    runningOfKind: row.runningOfKind,
    limits: readUserRunLimits(row.limits),
  }));
}

// UMA tentativa por transação: o lock do usuário (`NO KEY UPDATE`, que não conflita com a FK das execuções novas) serializa
// quem reivindica para o mesmo dono, então a contagem de `running` abaixo é a verdadeira; `SKIP LOCKED` faz o outro
// reivindicador seguir para o próximo em vez de esperar.
async function tryClaim(
  database: Pick<BunSQLDatabase, 'transaction'>,
  candidate: ClaimCandidate,
  claimedBy: string,
): Promise<ClaimedRun | undefined> {
  return database.transaction(async (transaction) => {
    const locked = await transaction
      .select({ limits: users.limits })
      .from(users)
      .where(and(eq(users.id, candidate.userId), isNull(users.deletedAt), isNull(users.blockedAt)))
      .for('no key update', { skipLocked: true });
    if (locked[0] === undefined) return undefined;
    const running = await transaction
      .select({ total: sql<number>`count(*)::int` })
      .from(runs)
      .where(
        and(
          eq(runs.userId, candidate.userId),
          eq(runs.kind, candidate.kind),
          eq(runs.status, RUN_STATUS.RUNNING),
        ),
      );
    const fresh = {
      ...candidate,
      limits: readUserRunLimits(locked[0].limits),
      runningOfKind: running[0]?.total ?? 0,
    };
    if (!hasCapacity(fresh)) return undefined;
    return startHead(transaction, fresh, claimedBy);
  });
}

async function startHead(
  transaction: Pick<DatabaseExecutor, 'select' | 'update'>,
  candidate: ClaimCandidate,
  claimedBy: string,
): Promise<ClaimedRun | undefined> {
  const head = await transaction
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.userId, candidate.userId),
        eq(runs.kind, candidate.kind),
        eq(runs.status, RUN_STATUS.QUEUED),
      ),
    )
    .orderBy(asc(runs.createdAt), asc(runs.id))
    .limit(1)
    .for('update', { skipLocked: true });
  const headId = head[0]?.id;
  if (headId === undefined) return undefined;
  const started = await transaction
    .update(runs)
    .set({
      status: RUN_STATUS.RUNNING,
      claimedBy,
      heartbeatAt: sql`now()`,
      startedAt: sql`coalesce(${runs.startedAt}, now())`,
    })
    .where(and(eq(runs.id, headId), eq(runs.status, RUN_STATUS.QUEUED)))
    .returning({ id: runs.id });
  return started[0] === undefined ? undefined : { runId: headId, kind: candidate.kind };
}

export async function claimNextRun(
  database: Pick<BunSQLDatabase, 'selectDistinctOn' | 'transaction'>,
  params: ClaimNextRunParams,
): Promise<ClaimedRun | undefined> {
  const candidates = [...(await listClaimCandidates(database))].sort(compareClaimCandidates);
  for (const candidate of candidates) {
    if (!hasCapacity(candidate)) continue;
    const claimed = await tryClaim(database, candidate, params.claimedBy);
    if (claimed !== undefined) return claimed;
  }
  return undefined;
}
