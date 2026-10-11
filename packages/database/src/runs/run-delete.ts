// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';
import { TERMINAL_RUN_STATUSES } from './run.constant.js';
import { RUN_DELETE_OUTCOME, type RunDeleteOutcome } from './run.types.js';

// Uma instrução só: marca apenas o que é do dono, ainda não apagado e TERMINADO. Se nada foi marcado, uma segunda leitura
// separa "não terminou" (existe, é do dono, está ativa) de "não existe" (inclusive a alheia e a já apagada).
export async function deleteRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<RunDeleteOutcome> {
  const owned = and(ownerCondition(scope, runs.userId), eq(runs.id, runId), isNull(runs.deletedAt));
  const marked = await executor
    .update(runs)
    .set({ deletedAt: sql`now()` })
    .where(and(owned, inArray(runs.status, [...TERMINAL_RUN_STATUSES])))
    .returning({ id: runs.id });
  if (marked.length > 0) return RUN_DELETE_OUTCOME.DELETED;
  const stillThere = await executor.select({ id: runs.id }).from(runs).where(owned).limit(1);
  return stillThere.length > 0 ? RUN_DELETE_OUTCOME.NOT_FINISHED : RUN_DELETE_OUTCOME.NOT_FOUND;
}
