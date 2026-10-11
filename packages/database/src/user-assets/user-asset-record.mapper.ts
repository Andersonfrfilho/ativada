// Copyright (c) 2026 Ada Technology. All rights reserved.
import { userAssets } from '../schema/user-assets.schema.js';
import type { UserAssetRecord } from './user-asset.types.js';

export const USER_ASSET_COLUMNS = {
  id: userAssets.id,
  symbol: userAssets.symbol,
  quantity: userAssets.quantity,
  averagePrice: userAssets.averagePrice,
  createdAt: userAssets.createdAt,
  updatedAt: userAssets.updatedAt,
} as const;

export function toUserAssetRecord(row: UserAssetRecord): UserAssetRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    quantity: row.quantity,
    averagePrice: row.averagePrice,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
