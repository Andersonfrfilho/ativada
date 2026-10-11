// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { USER_ASSET_DECISION_KIND, USER_ASSET_MUTATE_OUTCOME } from './user-asset.constant.js';

// Quantidade e preço médio são texto decimal exato (o `numeric` do banco): nenhuma conta de dinheiro passa por `number`.
export type UserAssetRecord = {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: string;
  readonly averagePrice: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// O que a regra de negócio (soma ponderada, venda dentro da quantidade) decide a partir da posição travada.
export type UserAssetDecision =
  | {
      readonly kind: typeof USER_ASSET_DECISION_KIND.SAVE;
      readonly quantity: string;
      readonly averagePrice: string;
    }
  | { readonly kind: typeof USER_ASSET_DECISION_KIND.REFUSE; readonly reason: string };

export type MutateUserAssetParams = {
  readonly symbol: string;
  // Teto de ativos do dono, conferido sob trava na MESMA transação do INSERT.
  readonly maxAssets: number;
  // Recebe a posição atual (ou `undefined`) com a linha travada; SÍNCRONA de propósito: nada de I/O dentro da trava.
  readonly decide: (current: UserAssetRecord | undefined) => UserAssetDecision;
};

export type MutateUserAssetResult =
  | { readonly outcome: typeof USER_ASSET_MUTATE_OUTCOME.SAVED; readonly asset: UserAssetRecord }
  | { readonly outcome: typeof USER_ASSET_MUTATE_OUTCOME.REFUSED; readonly reason: string }
  | { readonly outcome: typeof USER_ASSET_MUTATE_OUTCOME.LIMIT_REACHED };

export type ListUserAssetsParams = {
  readonly limit: number;
  // Último símbolo da página anterior (ordem alfabética).
  readonly after: string | undefined;
};

export type UserAssetsPage = {
  readonly assets: readonly UserAssetRecord[];
  readonly nextCursor: string | undefined;
};

// Toda leitura e escrita é filtrada pelo dono; ativo alheio ou inexistente é `undefined` / `false`, sem distinção.
export type UserAssetRepository = {
  readonly mutateUserAsset: (
    scope: OwnerScope,
    params: MutateUserAssetParams,
  ) => Promise<MutateUserAssetResult>;
  readonly findUserAsset: (
    scope: OwnerScope,
    symbol: string,
  ) => Promise<UserAssetRecord | undefined>;
  readonly listUserAssetsPage: (
    scope: OwnerScope,
    params: ListUserAssetsParams,
  ) => Promise<UserAssetsPage>;
  // Todos os ativos do dono (o teto os mantém poucos): é o que o resumo lê.
  readonly listUserAssets: (scope: OwnerScope) => Promise<readonly UserAssetRecord[]>;
  readonly deleteUserAsset: (scope: OwnerScope, symbol: string) => Promise<boolean>;
};
