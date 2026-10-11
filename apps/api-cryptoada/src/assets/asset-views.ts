// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserAssetRecord } from '@cryptoada/database';

// O que a API devolve: sem dono (dado interno que a exportação também não leva).
export type AssetView = {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: string;
  readonly averagePrice: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function toAssetView(record: UserAssetRecord): AssetView {
  return {
    id: record.id,
    symbol: record.symbol,
    quantity: record.quantity,
    averagePrice: record.averagePrice,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
