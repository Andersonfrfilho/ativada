// Copyright (c) 2026 Ada Technology. All rights reserved.
import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.schema.js';

export const CODE_HASH_LENGTH = 64;

export const telegramLinkCodes = pgTable(
  'telegram_link_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    codeHash: varchar('code_hash', { length: CODE_HASH_LENGTH }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('telegram_link_codes_code_hash_unique').on(table.codeHash),
    uniqueIndex('telegram_link_codes_user_id_unique').on(table.userId),
  ],
);
