// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNull } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { LOWERCASE_UUID_PATTERN } from '../database.constant.js';
import { createOwnerScope, type OwnerScope } from '../ownership/owner-scope.js';
import { userIdFromDatabase } from '../ownership/user-id.js';
import { runs } from '../schema/runs.schema.js';
import { users } from '../schema/users.schema.js';

// Para workers (backtest, walk-forward): o dono de uma execução que a API JÁ enfileirou depois de autorizar o
// usuário (ADR 0001 §e, regra 7). O `runId` nunca vem de cliente nem de payload: só da fila da própria API.
// Conta apagada ou bloqueada não tem dono resolvido, e a execução dela não prossegue.
export async function resolveRunOwnerScope(
  handle: DatabaseHandle,
  runId: string,
): Promise<OwnerScope | undefined> {
  if (!LOWERCASE_UUID_PATTERN.test(runId)) return undefined;
  const { database } = readOpenDatabase(handle);
  const rows = await database
    .select({ ownerId: runs.userId })
    .from(runs)
    .innerJoin(users, eq(users.id, runs.userId))
    .where(and(eq(runs.id, runId), isNull(users.deletedAt), isNull(users.blockedAt)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : createOwnerScope(userIdFromDatabase(row.ownerId));
}
