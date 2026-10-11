// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNull } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { runs } from '../schema/runs.schema.js';

export async function isOwnedRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<boolean> {
  const rows = await executor
    .select({ id: runs.id })
    .from(runs)
    .where(and(ownerCondition(scope, runs.userId), eq(runs.id, runId), isNull(runs.deletedAt)))
    .limit(1);
  return rows.length > 0;
}
