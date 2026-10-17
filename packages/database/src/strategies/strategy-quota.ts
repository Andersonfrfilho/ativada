// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, count, eq, isNull } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { STORAGE_QUOTA_RESOURCE, StorageQuotaReachedError } from '../quota/storage-quota.error.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { users } from '../schema/users.schema.js';
import type { AddStrategyVersionParams } from './strategy.types.js';

// A linha do dono TRAVADA serializa as criações: dois POST simultâneos não passam juntos do teto.
export async function assertStrategyRoom(
  executor: DatabaseExecutor,
  params: { readonly scope: OwnerScope; readonly maxStrategies: number },
): Promise<void> {
  const { scope } = params;
  await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, scope.ownerUserId))
    .for('no key update');
  const owned = await executor
    .select({ total: count() })
    .from(strategies)
    .where(
      and(
        ownerCondition(scope, strategies.userId),
        isNull(strategies.deletedAt),
        eq(strategies.isSystem, false),
      ),
    );
  if ((owned[0]?.total ?? 0) >= params.maxStrategies) {
    throw new StorageQuotaReachedError(STORAGE_QUOTA_RESOURCE.STRATEGIES);
  }
}

// No teto, só a configuração NOVA é recusada: o hash que já existe devolve a versão dele (idempotente).
export async function assertVersionRoom(
  executor: DatabaseExecutor,
  params: AddStrategyVersionParams,
): Promise<void> {
  if (params.maxVersions === undefined) return;
  const owned = await executor
    .select({ total: count() })
    .from(strategyVersions)
    .where(eq(strategyVersions.strategyId, params.strategyId));
  if ((owned[0]?.total ?? 0) < params.maxVersions) return;
  if ((await findVersionByHash(executor, params)) !== undefined) return;
  throw new StorageQuotaReachedError(STORAGE_QUOTA_RESOURCE.STRATEGY_VERSIONS);
}

async function findVersionByHash(
  executor: DatabaseExecutor,
  params: AddStrategyVersionParams,
): Promise<{ readonly id: string } | undefined> {
  const rows = await executor
    .select({ id: strategyVersions.id })
    .from(strategyVersions)
    .where(
      and(
        eq(strategyVersions.strategyId, params.strategyId),
        eq(strategyVersions.configHash, params.configHash),
      ),
    )
    .limit(1);
  return rows[0];
}
