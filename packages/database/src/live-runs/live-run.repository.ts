// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import { releaseClaimedRuns, renewHeartbeat } from '../run-queue/run-recovery.js';
import { runs } from '../schema/runs.schema.js';
import { claimLiveRuns } from './live-run-claim.js';
import type { LiveRunRepository } from './live-run.types.js';

// Conta bloqueada ou apagada (ADR 0001 §k): a simulação dela que está rodando é cancelada. As `queued` ficam como estão
// e não são reivindicadas enquanto a conta estiver inativa.
async function cancelLiveRunsOfInactiveOwners(
  database: Pick<BunSQLDatabase, 'update'>,
): Promise<number> {
  const rows = await database
    .update(runs)
    .set({
      status: RUN_STATUS.CANCELLED,
      finishedAt: sql`now()`,
      claimedBy: null,
      heartbeatAt: null,
    })
    .where(
      and(
        eq(runs.status, RUN_STATUS.RUNNING),
        eq(runs.kind, RUN_KIND.LIVE_PAPER),
        sql`exists (select 1 from users owner where owner.id = ${runs.userId} and (owner.deleted_at is not null or owner.blocked_at is not null))`,
      ),
    )
    .returning({ id: runs.id });
  return rows.length;
}

// Sem `OwnerScope`: quem reivindica é o processo do worker, que depois opera em nome do dono pelo escopo que
// `resolveRunOwnerScope` devolve (ADR 0001 §e, regra 8).
export function createLiveRunRepository(handle: DatabaseHandle): LiveRunRepository {
  const { database } = readOpenDatabase(handle);
  return {
    claimLiveRuns: (params) => claimLiveRuns(database, params),
    renewHeartbeat: (params) => renewHeartbeat(database, params),
    releaseClaimedRuns: (params) => releaseClaimedRuns(database, params),
    cancelLiveRunsOfInactiveOwners: () => cancelLiveRunsOfInactiveOwners(database),
  };
}
