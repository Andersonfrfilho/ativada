// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { users } from '../schema/users.schema.js';
import { toVersionRecord, VERSION_COLUMNS } from './strategy-record.mapper.js';
import type { EnsureSystemStrategyParams, StrategyVersionRecord } from './strategy.types.js';

async function findOrCreateSystemStrategy(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  name: string,
): Promise<string> {
  const found = await executor
    .select({ id: strategies.id })
    .from(strategies)
    .where(
      and(
        ownerCondition(scope, strategies.userId),
        eq(strategies.isSystem, true),
        isNull(strategies.deletedAt),
      ),
    )
    .limit(1);
  if (found[0] !== undefined) return found[0].id;
  const created = await executor
    .insert(strategies)
    .values({ id: Bun.randomUUIDv7(), userId: scope.ownerUserId, name, isSystem: true })
    .returning({ id: strategies.id });
  if (created[0] === undefined) throw new Error('INSERT de strategies não devolveu a linha');
  return created[0].id;
}

async function findVersionByHash(
  executor: DatabaseExecutor,
  params: { readonly strategyId: string; readonly configHash: string },
): Promise<StrategyVersionRecord | undefined> {
  const rows = await executor
    .select(VERSION_COLUMNS)
    .from(strategyVersions)
    .where(
      and(
        eq(strategyVersions.strategyId, params.strategyId),
        eq(strategyVersions.configHash, params.configHash),
      ),
    )
    .limit(1);
  return rows[0] === undefined ? undefined : toVersionRecord(rows[0]);
}

async function insertVersion(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: EnsureSystemStrategyParams & { readonly strategyId: string },
): Promise<StrategyVersionRecord> {
  const nextNumber = sql<number>`(select coalesce(max(${strategyVersions.version}), 0) + 1 from ${strategyVersions} where ${strategyVersions.strategyId} = ${params.strategyId})`;
  const rows = await executor
    .insert(strategyVersions)
    .values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      strategyId: params.strategyId,
      version: nextNumber,
      config: toJsonb(params.config),
      configHash: params.configHash,
    })
    .returning(VERSION_COLUMNS);
  if (rows[0] === undefined) throw new Error('INSERT de strategy_versions não devolveu a linha');
  return toVersionRecord(rows[0]);
}

// A linha do dono TRAVADA serializa as chamadas: duas execuções de equipe criadas juntas nunca fazem duas estratégias do
// sistema nem duas versões iguais. Não confere teto de estratégias (a estratégia do sistema não conta).
export async function ensureSystemStrategyVersion(
  database: Pick<BunSQLDatabase, 'transaction'>,
  scope: OwnerScope,
  params: EnsureSystemStrategyParams,
): Promise<StrategyVersionRecord> {
  return database.transaction(async (transaction) => {
    await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, scope.ownerUserId))
      .for('no key update');
    const strategyId = await findOrCreateSystemStrategy(transaction, scope, params.name);
    const existing = await findVersionByHash(transaction, {
      strategyId,
      configHash: params.configHash,
    });
    return existing ?? (await insertVersion(transaction, scope, { ...params, strategyId }));
  });
}
