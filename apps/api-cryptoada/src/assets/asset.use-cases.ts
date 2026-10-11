// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  USER_ASSET_MUTATE_OUTCOME,
  type MutateUserAssetResult,
  type OwnerScope,
  type UserAssetDecision,
  type UserAssetRecord,
  type UserAssetRepository,
} from '@cryptoada/database';

import { encodeAssetCursor } from './asset-cursor.js';
import { decideBuy, decideReplace, decideSell } from './asset-position.js';
import type { ReplaceAssetBody, TradeAssetBody } from './asset-requests.js';
import { toAssetView, type AssetView } from './asset-views.js';
import { ASSET_REFUSAL, ASSET_SIDE } from './asset.constant.js';
import {
  AssetInsufficientQuantityError,
  AssetLimitReachedError,
  AssetNotFoundError,
} from './asset.error.js';

export type AssetUseCaseDependencies = {
  readonly assets: UserAssetRepository;
  readonly maxAssets: number;
};

export type AssetPageOutput = {
  readonly items: readonly AssetView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type ReplaceAssetUseCase = (
  scope: OwnerScope,
  input: { readonly symbol: string; readonly body: ReplaceAssetBody },
) => Promise<AssetView>;
export type TradeAssetUseCase = (
  scope: OwnerScope,
  input: { readonly symbol: string; readonly body: TradeAssetBody },
) => Promise<AssetView>;
export type GetAssetUseCase = (scope: OwnerScope, symbol: string) => Promise<AssetView>;
export type ListAssetsUseCase = (
  scope: OwnerScope,
  page: { readonly limit: number; readonly after: string | undefined },
) => Promise<AssetPageOutput>;
export type DeleteAssetUseCase = (scope: OwnerScope, symbol: string) => Promise<void>;

function toView(result: MutateUserAssetResult): AssetView {
  if (result.outcome === USER_ASSET_MUTATE_OUTCOME.LIMIT_REACHED)
    throw new AssetLimitReachedError();
  if (result.outcome === USER_ASSET_MUTATE_OUTCOME.REFUSED) {
    if (result.reason === ASSET_REFUSAL.INSUFFICIENT_QUANTITY) {
      throw new AssetInsufficientQuantityError();
    }
    throw new AssetNotFoundError();
  }
  return toAssetView(result.asset);
}

function decideTrade(
  current: UserAssetRecord | undefined,
  body: TradeAssetBody,
): UserAssetDecision {
  return body.side === ASSET_SIDE.BUY
    ? decideBuy({ current, quantity: body.quantity, price: body.price })
    : decideSell({ current, quantity: body.quantity });
}

export function createReplaceAssetUseCase(
  dependencies: AssetUseCaseDependencies,
): ReplaceAssetUseCase {
  return async (scope, input) =>
    toView(
      await dependencies.assets.mutateUserAsset(scope, {
        symbol: input.symbol,
        maxAssets: dependencies.maxAssets,
        decide: () => decideReplace(input.body),
      }),
    );
}

// Compra soma e pondera o preço médio; venda desconta e recusa o que passa da quantidade. A conta roda com a posição TRAVADA.
export function createTradeAssetUseCase(dependencies: AssetUseCaseDependencies): TradeAssetUseCase {
  return async (scope, input) =>
    toView(
      await dependencies.assets.mutateUserAsset(scope, {
        symbol: input.symbol,
        maxAssets: dependencies.maxAssets,
        decide: (current) => decideTrade(current, input.body),
      }),
    );
}

export function createGetAssetUseCase(dependencies: AssetUseCaseDependencies): GetAssetUseCase {
  return async (scope, symbol) => {
    const asset = await dependencies.assets.findUserAsset(scope, symbol);
    if (asset === undefined) throw new AssetNotFoundError();
    return toAssetView(asset);
  };
}

export function createListAssetsUseCase(dependencies: AssetUseCaseDependencies): ListAssetsUseCase {
  return async (scope, page) => {
    const result = await dependencies.assets.listUserAssetsPage(scope, page);
    return {
      items: result.assets.map(toAssetView),
      nextCursor: result.nextCursor === undefined ? null : encodeAssetCursor(result.nextCursor),
      perPage: page.limit,
    };
  };
}

export function createDeleteAssetUseCase(
  dependencies: AssetUseCaseDependencies,
): DeleteAssetUseCase {
  return async (scope, symbol) => {
    const isDeleted = await dependencies.assets.deleteUserAsset(scope, symbol);
    if (!isDeleted) throw new AssetNotFoundError();
  };
}
