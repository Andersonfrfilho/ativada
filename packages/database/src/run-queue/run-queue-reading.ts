// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, inArray, or, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { RUN_KIND, RUN_STATUS, type RunKind } from '../runs/run.constant.js';
import { runs } from '../schema/runs.schema.js';
import { users } from '../schema/users.schema.js';
import { readUserRunLimits, type UserRunLimits } from './run-limits.js';
import { CLAIMABLE_RUN_KINDS } from './run-queue.constant.js';
import type { RunQueuePosition, RunQueueSummary } from './run-queue.types.js';

type Reader = Pick<DatabaseExecutor, 'select'>;

async function countRows(reader: Reader, where: ReturnType<typeof and>): Promise<number> {
  const rows = await reader
    .select({ total: sql<number>`count(*)::int` })
    .from(runs)
    .where(where);
  return rows[0]?.total ?? 0;
}

// A fila é só dos tipos que a fila reivindica: a simulação ao vivo `queued` não ocupa vaga dela.
export function countQueuedRuns(reader: Reader, scope: OwnerScope): Promise<number> {
  return countRows(
    reader,
    and(
      ownerCondition(scope, runs.userId),
      eq(runs.status, RUN_STATUS.QUEUED),
      inArray(runs.kind, [...CLAIMABLE_RUN_KINDS]),
    ),
  );
}

// Fila ou rodando: é o que conta para o teto de simulações ao vivo ativas.
export function countActiveRuns(reader: Reader, scope: OwnerScope, kind: RunKind): Promise<number> {
  return countRows(
    reader,
    and(
      ownerCondition(scope, runs.userId),
      eq(runs.kind, kind),
      or(eq(runs.status, RUN_STATUS.QUEUED), eq(runs.status, RUN_STATUS.RUNNING)),
    ),
  );
}

export async function readOwnerRunLimits(
  reader: Reader,
  scope: OwnerScope,
): Promise<UserRunLimits> {
  const rows = await reader
    .select({ limits: users.limits })
    .from(users)
    .where(ownerCondition(scope, users.id))
    .limit(1);
  return readUserRunLimits(rows[0]?.limits);
}

// A posição vem de CONTAGENS: a do dono conta só as execuções dele; a global é um número, sem linha de outro usuário.
export async function findQueuePosition(
  reader: Reader,
  scope: OwnerScope,
  runId: string,
): Promise<RunQueuePosition | undefined> {
  const queued = and(
    eq(runs.status, RUN_STATUS.QUEUED),
    inArray(runs.kind, [...CLAIMABLE_RUN_KINDS]),
  );
  const target = await reader
    .select({ id: runs.id })
    .from(runs)
    .where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId), queued))
    .limit(1);
  if (target[0] === undefined) return undefined;
  const isAhead = sql`(${runs.createdAt}, ${runs.id}) < (select t.created_at, t.id from runs t where t.id = ${runId}::uuid)`;
  const own = await countRows(reader, and(ownerCondition(scope, runs.userId), queued, isAhead));
  const overall = await countRows(reader, and(queued, isAhead));
  return { own: own + 1, overall: overall + 1 };
}

type SummaryRow = { readonly kind: string; readonly status: string; readonly total: number };

function emptyKindCounts(): { queued: number; running: number } {
  return { queued: 0, running: 0 };
}

// Só números agregados por tipo e estado: nada que identifique usuário.
export async function readQueueSummary(reader: Reader): Promise<RunQueueSummary> {
  const rows: readonly SummaryRow[] = await reader
    .select({ kind: runs.kind, status: runs.status, total: sql<number>`count(*)::int` })
    .from(runs)
    .where(inArray(runs.status, [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING]))
    .groupBy(runs.kind, runs.status);
  const byKind = {
    [RUN_KIND.BACKTEST]: emptyKindCounts(),
    [RUN_KIND.WALK_FORWARD]: emptyKindCounts(),
    [RUN_KIND.LIVE_PAPER]: emptyKindCounts(),
  };
  let queued = 0;
  let running = 0;
  for (const row of rows) {
    const counts = byKind[row.kind as RunKind];
    if (row.status === RUN_STATUS.QUEUED) {
      counts.queued += row.total;
      queued += row.total;
    } else {
      counts.running += row.total;
      running += row.total;
    }
  }
  return { queued, running, byKind };
}
