// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import { check, numeric, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import {
  USER_ASSET_SYMBOL_MAX_LENGTH,
  USER_ASSET_SYMBOL_PATTERN,
} from '../user-assets/user-asset.constant.js';
import { literalList } from './check-literals.js';
import { users } from './users.schema.js';

// O ativo que o usuário tem de verdade (RF15), digitado por ele: quantidade e preço médio. Uma linha por (dono, par). A
// quantidade pode zerar (venda total) sem apagar a linha; o preço médio é sempre positivo.
export const userAssets = pgTable(
  'user_assets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    symbol: varchar('symbol', { length: USER_ASSET_SYMBOL_MAX_LENGTH }).notNull(),
    quantity: numeric('quantity').notNull(),
    averagePrice: numeric('average_price').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_assets_id_user_id_unique').on(table.id, table.userId),
    unique('user_assets_user_id_symbol_unique').on(table.userId, table.symbol),
    check(
      'user_assets_symbol_check',
      sql`${table.symbol} ~ ${literalList([USER_ASSET_SYMBOL_PATTERN])}`,
    ),
    check('user_assets_quantity_check', sql`${table.quantity} >= 0`),
    check('user_assets_average_price_check', sql`${table.averagePrice} > 0`),
  ],
);
