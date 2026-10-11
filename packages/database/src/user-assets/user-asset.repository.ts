// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, count, eq, gt, sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { userAssets } from '../schema/user-assets.schema.js';
import { users } from '../schema/users.schema.js';
import {
  USER_ASSET_DECISION_KIND,
  USER_ASSET_MUTATE_OUTCOME,
  USER_ASSET_PAGE_MAXIMUM_SIZE,
} from './user-asset.constant.js';
import { toUserAssetRecord, USER_ASSET_COLUMNS } from './user-asset-record.mapper.js';
import type {
  ListUserAssetsParams,
  MutateUserAssetParams,
  MutateUserAssetResult,
  UserAssetRecord,
  UserAssetRepository,
  UserAssetsPage,
} from './user-asset.types.js';

type Database = ReturnType<typeof readOpenDatabase>['database'];

function ownedAsset(scope: OwnerScope, symbol: string): SQL | undefined {
  return and(ownerCondition(scope, userAssets.userId), eq(userAssets.symbol, symbol));
}

async function selectAsset(
  executor: DatabaseExecutor,
  params: { readonly scope: OwnerScope; readonly symbol: string; readonly isLocked: boolean },
): Promise<UserAssetRecord | undefined> {
  const query = executor
    .select(USER_ASSET_COLUMNS)
    .from(userAssets)
    .where(ownedAsset(params.scope, params.symbol))
    .limit(1);
  const rows = await (params.isLocked ? query.for('update') : query);
  const row = rows[0];
  return row === undefined ? undefined : toUserAssetRecord(row);
}

async function insertAsset(
  transaction: DatabaseExecutor,
  params: {
    readonly scope: OwnerScope;
    readonly symbol: string;
    readonly quantity: string;
    readonly averagePrice: string;
  },
): Promise<UserAssetRecord> {
  const rows = await transaction
    .insert(userAssets)
    .values({
      id: Bun.randomUUIDv7(),
      userId: params.scope.ownerUserId,
      symbol: params.symbol,
      quantity: params.quantity,
      averagePrice: params.averagePrice,
    })
    .returning(USER_ASSET_COLUMNS);
  const row = rows[0];
  if (row === undefined) throw new Error('INSERT de user_assets não devolveu a linha');
  return toUserAssetRecord(row);
}

async function saveAsset(
  transaction: DatabaseExecutor,
  params: {
    readonly scope: OwnerScope;
    readonly symbol: string;
    readonly current: UserAssetRecord | undefined;
    readonly maxAssets: number;
    readonly save: { readonly quantity: string; readonly averagePrice: string };
  },
): Promise<MutateUserAssetResult> {
  const { scope, symbol, save } = params;
  if (params.current === undefined) {
    const owned = await transaction
      .select({ total: count() })
      .from(userAssets)
      .where(ownerCondition(scope, userAssets.userId));
    if ((owned[0]?.total ?? 0) >= params.maxAssets) {
      return { outcome: USER_ASSET_MUTATE_OUTCOME.LIMIT_REACHED };
    }
    const asset = await insertAsset(transaction, { scope, symbol, ...save });
    return { outcome: USER_ASSET_MUTATE_OUTCOME.SAVED, asset };
  }
  const rows = await transaction
    .update(userAssets)
    .set({ ...save, updatedAt: sql`now()` })
    .where(ownedAsset(scope, symbol))
    .returning(USER_ASSET_COLUMNS);
  const row = rows[0];
  if (row === undefined) throw new Error('UPDATE de user_assets não devolveu a linha');
  return { outcome: USER_ASSET_MUTATE_OUTCOME.SAVED, asset: toUserAssetRecord(row) };
}

// A linha do dono e a posição ficam TRAVADAS enquanto a regra decide: duas compras simultâneas do mesmo par somam uma depois
// da outra (o preço médio ponderado nunca se perde), e o teto de ativos vale sob corrida.
async function mutateUserAsset(
  database: Database,
  scope: OwnerScope,
  params: MutateUserAssetParams,
): Promise<MutateUserAssetResult> {
  return database.transaction(async (transaction): Promise<MutateUserAssetResult> => {
    await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, scope.ownerUserId))
      .for('no key update');
    const current = await selectAsset(transaction, {
      scope,
      symbol: params.symbol,
      isLocked: true,
    });
    const decision = params.decide(current);
    if (decision.kind === USER_ASSET_DECISION_KIND.REFUSE) {
      return { outcome: USER_ASSET_MUTATE_OUTCOME.REFUSED, reason: decision.reason };
    }
    return saveAsset(transaction, {
      scope,
      symbol: params.symbol,
      current,
      maxAssets: params.maxAssets,
      save: { quantity: decision.quantity, averagePrice: decision.averagePrice },
    });
  });
}

async function listUserAssetsPage(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ListUserAssetsParams,
): Promise<UserAssetsPage> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), USER_ASSET_PAGE_MAXIMUM_SIZE);
  const rows = await executor
    .select(USER_ASSET_COLUMNS)
    .from(userAssets)
    .where(
      and(
        ownerCondition(scope, userAssets.userId),
        params.after === undefined ? undefined : gt(userAssets.symbol, params.after),
      ),
    )
    .orderBy(asc(userAssets.symbol))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    assets: page.map(toUserAssetRecord),
    nextCursor: rows.length > limit && last !== undefined ? last.symbol : undefined,
  };
}

async function listUserAssets(
  executor: DatabaseExecutor,
  scope: OwnerScope,
): Promise<readonly UserAssetRecord[]> {
  const rows = await executor
    .select(USER_ASSET_COLUMNS)
    .from(userAssets)
    .where(ownerCondition(scope, userAssets.userId))
    .orderBy(asc(userAssets.symbol));
  return rows.map(toUserAssetRecord);
}

async function deleteUserAsset(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  symbol: string,
): Promise<boolean> {
  const rows = await executor
    .delete(userAssets)
    .where(ownedAsset(scope, symbol))
    .returning({ id: userAssets.id });
  return rows.length > 0;
}

export function createUserAssetRepository(handle: DatabaseHandle): UserAssetRepository {
  const { database } = readOpenDatabase(handle);
  return {
    mutateUserAsset: (scope, params) => mutateUserAsset(database, scope, params),
    findUserAsset: (scope, symbol) => selectAsset(database, { scope, symbol, isLocked: false }),
    listUserAssetsPage: (scope, params) => listUserAssetsPage(database, scope, params),
    listUserAssets: (scope) => listUserAssets(database, scope),
    deleteUserAsset: (scope, symbol) => deleteUserAsset(database, scope, symbol),
  };
}
