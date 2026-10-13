// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { fills } from '../schema/fills.schema.js';
import { toFillInput } from './run-result-record.mapper.js';
import type { FillInput } from './run-result.types.js';

export type ListFillsOfPositionsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly positionKeys: readonly string[];
};

// Uma consulta para a página inteira (no máximo dois preenchimentos por posição): sem N+1.
export async function listFillsOfPositions(
  request: ListFillsOfPositionsRequest,
): Promise<readonly FillInput[]> {
  const { executor, scope, runId, positionKeys } = request;
  if (positionKeys.length === 0) return [];
  const rows = await executor
    .select()
    .from(fills)
    .where(
      and(
        ownerCondition(scope, fills.userId),
        eq(fills.runId, runId),
        inArray(fills.positionKey, [...positionKeys]),
      ),
    )
    .orderBy(asc(fills.candleTime), asc(fills.orderKey));
  return rows.map(toFillInput);
}
