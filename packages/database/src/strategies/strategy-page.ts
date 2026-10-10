// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, desc, eq, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { STRATEGY_COLUMNS, toVersionRecord, VERSION_COLUMNS } from './strategy-record.mapper.js';
import type {
  CreateStrategyWithVersionParams,
  CreateStrategyWithVersionResult,
  ListStrategiesParams,
  ListVersionsParams,
  StrategiesPage,
  StrategyCursor,
  VersionsPage,
} from './strategy.types.js';

export const STRATEGY_PAGE_MAXIMUM_SIZE = 100;

function clampLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), STRATEGY_PAGE_MAXIMUM_SIZE);
}

function isBeforeCursor(after: StrategyCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return sql`(${strategies.createdAt}, ${strategies.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
}

// Mais recentes primeiro. O cursor leva `created_at::text` (microssegundos): o Date do JS repetiria linhas.
export async function listStrategiesPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListStrategiesParams,
): Promise<StrategiesPage> {
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select({ ...STRATEGY_COLUMNS, createdAtText: sql<string>`${strategies.createdAt}::text` })
    .from(strategies)
    .where(
      and(
        ownerCondition(scope, strategies.userId),
        isNull(strategies.deletedAt),
        isBeforeCursor(params.after),
      ),
    )
    .orderBy(desc(strategies.createdAt), desc(strategies.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    strategies: page.map((row) => ({
      id: row.id,
      name: row.name,
      isExample: row.isExample,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    nextCursor:
      rows.length > limit && last !== undefined
        ? { createdAt: last.createdAtText, id: last.id }
        : undefined,
  };
}

// Versões da mais nova para a mais antiga; `undefined` quando a estratégia não é do dono ou foi apagada.
export async function listVersionsPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListVersionsParams,
): Promise<VersionsPage | undefined> {
  const owned = await executor
    .select({ id: strategies.id })
    .from(strategies)
    .where(
      and(
        ownerCondition(scope, strategies.userId),
        eq(strategies.id, params.strategyId),
        isNull(strategies.deletedAt),
      ),
    )
    .limit(1);
  if (owned.length === 0) return undefined;
  const limit = clampLimit(params.limit);
  const rows = await executor
    .select(VERSION_COLUMNS)
    .from(strategyVersions)
    .where(
      and(
        ownerCondition(scope, strategyVersions.userId),
        eq(strategyVersions.strategyId, params.strategyId),
        params.after === undefined ? undefined : lt(strategyVersions.version, params.after),
      ),
    )
    .orderBy(desc(strategyVersions.version))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    versions: page.map(toVersionRecord),
    nextCursor: rows.length > limit && last !== undefined ? last.version : undefined,
  };
}

// A estratégia e a versão 1 nascem na MESMA transação: nunca fica estratégia sem versão.
export async function createStrategyWithFirstVersion(
  database: Pick<BunSQLDatabase, 'transaction'>,
  scope: OwnerScope,
  params: CreateStrategyWithVersionParams,
): Promise<CreateStrategyWithVersionResult> {
  return database.transaction(async (transaction) => {
    const strategyRows = await transaction
      .insert(strategies)
      .values({
        id: Bun.randomUUIDv7(),
        userId: scope.ownerUserId,
        name: params.name,
        isExample: params.isExample,
      })
      .returning(STRATEGY_COLUMNS);
    const strategy = strategyRows[0];
    if (strategy === undefined) throw new Error('INSERT de strategies não devolveu a linha');
    const versionRows = await transaction
      .insert(strategyVersions)
      .values({
        id: Bun.randomUUIDv7(),
        userId: scope.ownerUserId,
        strategyId: strategy.id,
        version: 1,
        config: toJsonb(params.config),
        configHash: params.configHash,
      })
      .returning(VERSION_COLUMNS);
    const version = versionRows[0];
    if (version === undefined) throw new Error('INSERT de strategy_versions não devolveu a linha');
    return { strategy, version: toVersionRecord(version) };
  });
}
