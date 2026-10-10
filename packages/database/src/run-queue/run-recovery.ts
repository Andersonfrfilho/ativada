// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { RUN_STATUS } from '../runs/run.constant.js';
import { runs } from '../schema/runs.schema.js';
import {
  CLAIMABLE_RUN_KINDS,
  RUN_ORPHAN_POLICY,
  RUN_ORPHANED_ERROR_CODE,
} from './run-queue.constant.js';
import type {
  ReclaimExpiredRunsParams,
  ReclaimResult,
  RenewHeartbeatParams,
  RenewHeartbeatResult,
} from './run-queue.types.js';

type Writer = Pick<DatabaseExecutor, 'update'>;

const NO_CLAIM = { claimedBy: null, heartbeatAt: null } as const;

export async function renewHeartbeat(
  executor: Pick<DatabaseExecutor, 'select' | 'update'>,
  params: RenewHeartbeatParams,
): Promise<RenewHeartbeatResult> {
  if (params.runIds.length === 0) return { held: [], lost: [] };
  const rows = await executor
    .update(runs)
    .set({ heartbeatAt: sql`now()` })
    .where(
      and(
        eq(runs.status, RUN_STATUS.RUNNING),
        eq(runs.claimedBy, params.claimedBy),
        inArray(runs.id, [...params.runIds]),
      ),
    )
    .returning({ id: runs.id });
  const held = rows.map((row) => row.id);
  const missing = params.runIds.filter((runId) => !held.includes(runId));
  if (missing.length === 0) return { held, lost: [] };
  const taken = await executor
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(inArray(runs.id, missing), inArray(runs.status, [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING])),
    );
  return { held, lost: taken.map((row) => row.id) };
}

// Batimento ausente (execução `running` sem dono) vale como vencido.
function isExpired(timeoutSeconds: number): ReturnType<typeof or> {
  return or(
    isNull(runs.heartbeatAt),
    lt(runs.heartbeatAt, sql`now() - (${timeoutSeconds}::int * interval '1 second')`),
  );
}

function expiredClaimable(timeoutSeconds: number): ReturnType<typeof and> {
  return and(
    eq(runs.status, RUN_STATUS.RUNNING),
    inArray(runs.kind, [...CLAIMABLE_RUN_KINDS]),
    isExpired(timeoutSeconds),
  );
}

// Sem checkpoint não há o que retomar (a política padrão falha); com checkpoint, a execução volta à fila e a próxima
// reivindicação a retoma de onde parou. Duas instruções atômicas: quem renovar o batimento antes delas vence a corrida.
export async function reclaimExpiredRuns(
  database: Pick<BunSQLDatabase, 'transaction'>,
  params: ReclaimExpiredRunsParams,
): Promise<ReclaimResult> {
  return database.transaction(async (transaction) => {
    const isResumable = params.orphanPolicy === RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT;
    const failed = await transaction
      .update(runs)
      .set({
        status: RUN_STATUS.FAILED,
        errorCode: RUN_ORPHANED_ERROR_CODE,
        finishedAt: sql`now()`,
        ...NO_CLAIM,
      })
      .where(
        and(
          expiredClaimable(params.heartbeatTimeoutSeconds),
          isResumable ? isNull(runs.engineState) : undefined,
        ),
      )
      .returning({ id: runs.id });
    const requeued = await transaction
      .update(runs)
      .set({ status: RUN_STATUS.QUEUED, ...NO_CLAIM })
      .where(expiredClaimable(params.heartbeatTimeoutSeconds))
      .returning({ id: runs.id });
    return { requeued: requeued.length, failed: failed.length };
  });
}

// Encerramento gracioso: a execução volta à fila com o checkpoint, o progresso e o `started_at` intactos.
export async function releaseClaimedRuns(
  executor: Writer,
  params: { readonly claimedBy: string },
): Promise<number> {
  const rows = await executor
    .update(runs)
    .set({ status: RUN_STATUS.QUEUED, ...NO_CLAIM })
    .where(and(eq(runs.status, RUN_STATUS.RUNNING), eq(runs.claimedBy, params.claimedBy)))
    .returning({ id: runs.id });
  return rows.length;
}

// Conta bloqueada ou apagada (ADR 0001 §k): a execução dela que está rodando é cancelada e a thread a vê entre lotes.
// As `queued` ficam como estão: não são reivindicadas enquanto a conta estiver inativa.
export async function cancelRunsOfInactiveOwners(executor: Writer): Promise<number> {
  const rows = await executor
    .update(runs)
    .set({ status: RUN_STATUS.CANCELLED, finishedAt: sql`now()`, ...NO_CLAIM })
    .where(
      and(
        eq(runs.status, RUN_STATUS.RUNNING),
        inArray(runs.kind, [...CLAIMABLE_RUN_KINDS]),
        sql`exists (select 1 from users owner where owner.id = ${runs.userId} and (owner.deleted_at is not null or owner.blocked_at is not null))`,
      ),
    )
    .returning({ id: runs.id });
  return rows.length;
}
