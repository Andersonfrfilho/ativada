// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  USER_ASSET_DECISION_KIND,
  USER_ASSET_MUTATE_OUTCOME,
} from '../../../packages/database/src/user-assets/user-asset.constant.js';
import type {
  UserAssetRecord,
  UserAssetRepository,
} from '../../../packages/database/src/user-assets/user-asset.types.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';

type Stored = { readonly userId: UserId; record: UserAssetRecord };

const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;

export type InMemoryUserAssets = {
  readonly repository: UserAssetRepository;
  readonly allOf: (scope: OwnerScope) => readonly UserAssetRecord[];
};

// Espelha as regras do repositório real: tudo filtrado pelo dono, um ativo por (dono, par), o teto só vale para o ativo NOVO,
// a regra decide com a posição atual e uma recusa não grava, e a página vai em ordem alfabética do par.
export function createInMemoryUserAssets(): InMemoryUserAssets {
  const stored: Stored[] = [];
  let sequence = 0;
  const ownedBy = (scope: OwnerScope): Stored[] =>
    stored.filter((entry) => entry.userId === scope.ownerUserId);
  const find = (scope: OwnerScope, symbol: string): Stored | undefined =>
    ownedBy(scope).find((entry) => entry.record.symbol === symbol);
  const nextDate = (): Date => {
    sequence += 1;
    return new Date(EPOCH_MILLISECONDS + sequence * MILLISECONDS_PER_ROW);
  };

  const repository: UserAssetRepository = {
    mutateUserAsset: (scope, params) => {
      const entry = find(scope, params.symbol);
      const decision = params.decide(entry?.record);
      if (decision.kind === USER_ASSET_DECISION_KIND.REFUSE) {
        return Promise.resolve({
          outcome: USER_ASSET_MUTATE_OUTCOME.REFUSED,
          reason: decision.reason,
        });
      }
      if (entry !== undefined) {
        entry.record = {
          ...entry.record,
          quantity: decision.quantity,
          averagePrice: decision.averagePrice,
          updatedAt: nextDate(),
        };
        return Promise.resolve({ outcome: USER_ASSET_MUTATE_OUTCOME.SAVED, asset: entry.record });
      }
      if (ownedBy(scope).length >= params.maxAssets) {
        return Promise.resolve({ outcome: USER_ASSET_MUTATE_OUTCOME.LIMIT_REACHED });
      }
      const createdAt = nextDate();
      const record: UserAssetRecord = {
        id: crypto.randomUUID(),
        symbol: params.symbol,
        quantity: decision.quantity,
        averagePrice: decision.averagePrice,
        createdAt,
        updatedAt: createdAt,
      };
      stored.push({ userId: scope.ownerUserId, record });
      return Promise.resolve({ outcome: USER_ASSET_MUTATE_OUTCOME.SAVED, asset: record });
    },
    findUserAsset: (scope, symbol) => Promise.resolve(find(scope, symbol)?.record),
    listUserAssets: (scope) =>
      Promise.resolve(
        ownedBy(scope)
          .map((entry) => entry.record)
          .sort((first, second) => first.symbol.localeCompare(second.symbol)),
      ),
    listUserAssetsPage: async (scope, params) => {
      const all = (await repository.listUserAssets(scope)).filter(
        (row) => params.after === undefined || row.symbol > params.after,
      );
      const page = all.slice(0, params.limit);
      const last = page.at(-1);
      return {
        assets: page,
        nextCursor: all.length > params.limit && last !== undefined ? last.symbol : undefined,
      };
    },
    deleteUserAsset: (scope, symbol) => {
      const index = stored.findIndex(
        (entry) => entry.userId === scope.ownerUserId && entry.record.symbol === symbol,
      );
      if (index === -1) return Promise.resolve(false);
      stored.splice(index, 1);
      return Promise.resolve(true);
    },
  };
  return { repository, allOf: (scope) => ownedBy(scope).map((entry) => entry.record) };
}
