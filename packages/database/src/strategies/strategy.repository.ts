// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { assertVersionRoom } from './strategy-quota.js';
import { ensureSystemStrategyVersion } from './system-strategy.js';
import { seedExampleStrategy } from './example-strategy-seed.js';
import {
  createStrategyWithFirstVersion,
  listStrategiesPage,
  listVersionsPage,
} from './strategy-page.js';
import { STRATEGY_COLUMNS, toVersionRecord, VERSION_COLUMNS } from './strategy-record.mapper.js';
import type {
  AddStrategyVersionParams,
  AddStrategyVersionResult,
  CreateStrategyParams,
  StrategyRecord,
  StrategyRepository,
  StrategyVersionRecord,
} from './strategy.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

// A `model-team-1` do usuário (marca `is_system`) não aparece nem se acha por aqui: fica fora da lista e do teto de estratégias.
function visibleStrategies(scope: OwnerScope): ReturnType<typeof and> {
  return and(
    ownerCondition(scope, strategies.userId),
    isNull(strategies.deletedAt),
    eq(strategies.isSystem, false),
  );
}

function activeStrategy(scope: OwnerScope, strategyId: string): ReturnType<typeof and> {
  return and(visibleStrategies(scope), eq(strategies.id, strategyId));
}

async function createStrategy(
  database: Database,
  scope: OwnerScope,
  params: CreateStrategyParams,
): Promise<StrategyRecord> {
  const rows = await database
    .insert(strategies)
    .values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      name: params.name,
      isExample: params.isExample,
    })
    .returning(STRATEGY_COLUMNS);
  const created = rows[0];
  if (created === undefined) throw new Error('INSERT de strategies não devolveu a linha');
  return created;
}

async function findStrategy(
  database: Database,
  scope: OwnerScope,
  strategyId: string,
): Promise<StrategyRecord | undefined> {
  const rows = await database
    .select(STRATEGY_COLUMNS)
    .from(strategies)
    .where(activeStrategy(scope, strategyId))
    .limit(1);
  return rows[0];
}

async function listStrategies(
  database: Database,
  scope: OwnerScope,
): Promise<readonly StrategyRecord[]> {
  return database
    .select(STRATEGY_COLUMNS)
    .from(strategies)
    .where(visibleStrategies(scope))
    .orderBy(asc(strategies.createdAt), asc(strategies.id));
}

async function softDeleteStrategy(
  database: Database,
  scope: OwnerScope,
  strategyId: string,
): Promise<boolean> {
  const rows = await database
    .update(strategies)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(activeStrategy(scope, strategyId))
    .returning({ id: strategies.id });
  return rows.length > 0;
}

async function selectVersionByHash(
  executor: DatabaseExecutor,
  params: AddStrategyVersionParams,
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
  const row = rows[0];
  return row === undefined ? undefined : toVersionRecord(row);
}

async function insertNextVersion(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: AddStrategyVersionParams,
): Promise<StrategyVersionRecord | undefined> {
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
    .onConflictDoNothing({ target: [strategyVersions.strategyId, strategyVersions.configHash] })
    .returning(VERSION_COLUMNS);
  const row = rows[0];
  return row === undefined ? undefined : toVersionRecord(row);
}

// O FOR UPDATE na estratégia serializa as versões dela: a numeração não repete e o hash igual vira uma só.
async function addVersion(
  database: Database,
  scope: OwnerScope,
  params: AddStrategyVersionParams,
): Promise<AddStrategyVersionResult | undefined> {
  return database.transaction(async (transaction) => {
    const locked = await transaction
      .select({ id: strategies.id })
      .from(strategies)
      .where(activeStrategy(scope, params.strategyId))
      .for('update');
    if (locked.length === 0) return undefined;
    await assertVersionRoom(transaction, params);
    const inserted = await insertNextVersion(transaction, scope, params);
    if (inserted !== undefined) {
      await transaction
        .update(strategies)
        .set({ updatedAt: sql`now()` })
        .where(activeStrategy(scope, params.strategyId));
      return { version: inserted, isNew: true };
    }
    const existing = await selectVersionByHash(transaction, params);
    return existing === undefined ? undefined : { version: existing, isNew: false };
  });
}

async function findVersion(
  database: Database,
  scope: OwnerScope,
  versionId: string,
): Promise<StrategyVersionRecord | undefined> {
  const rows = await database
    .select(VERSION_COLUMNS)
    .from(strategyVersions)
    .where(and(ownerCondition(scope, strategyVersions.userId), eq(strategyVersions.id, versionId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toVersionRecord(row);
}

async function listVersions(
  database: Database,
  scope: OwnerScope,
  strategyId: string,
): Promise<readonly StrategyVersionRecord[] | undefined> {
  if ((await findStrategy(database, scope, strategyId)) === undefined) return undefined;
  const rows = await database
    .select(VERSION_COLUMNS)
    .from(strategyVersions)
    .where(
      and(
        ownerCondition(scope, strategyVersions.userId),
        eq(strategyVersions.strategyId, strategyId),
      ),
    )
    .orderBy(asc(strategyVersions.version));
  return rows.map(toVersionRecord);
}

export function createStrategyRepository(handle: DatabaseHandle): StrategyRepository {
  const { database } = readOpenDatabase(handle);
  return {
    createStrategy: (scope, params) => createStrategy(database, scope, params),
    createStrategyWithFirstVersion: (scope, params) =>
      createStrategyWithFirstVersion(database, scope, params),
    seedExampleStrategy: (scope, params) => seedExampleStrategy(database, scope, params),
    ensureSystemStrategyVersion: (scope, params) =>
      ensureSystemStrategyVersion(database, scope, params),
    listStrategiesPage: (scope, params) => listStrategiesPage(database, scope, params),
    listVersionsPage: (scope, params) => listVersionsPage(database, scope, params),
    findStrategy: (scope, strategyId) => findStrategy(database, scope, strategyId),
    listStrategies: (scope) => listStrategies(database, scope),
    softDeleteStrategy: (scope, strategyId) => softDeleteStrategy(database, scope, strategyId),
    addVersion: (scope, params) => addVersion(database, scope, params),
    findVersion: (scope, versionId) => findVersion(database, scope, versionId),
    listVersions: (scope, strategyId) => listVersions(database, scope, strategyId),
  };
}
