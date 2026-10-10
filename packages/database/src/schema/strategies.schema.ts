// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { RUN_HASH_LENGTH } from '../runs/run.constant.js';
import { users } from './users.schema.js';

export const STRATEGY_NAME_MAX_LENGTH = 120;

export const strategies = pgTable(
  'strategies',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: STRATEGY_NAME_MAX_LENGTH }).notNull(),
    isExample: boolean('is_example').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('strategies_id_user_id_unique').on(table.id, table.userId),
    index('strategies_user_id_created_at_idx').on(table.userId, table.createdAt),
    uniqueIndex('strategies_user_id_example_unique')
      .on(table.userId)
      .where(sql`${table.isExample}`),
    check('strategies_name_not_blank_check', sql`length(btrim(${table.name})) > 0`),
  ],
);

export const strategyVersions = pgTable(
  'strategy_versions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    strategyId: uuid('strategy_id').notNull(),
    version: integer('version').notNull(),
    config: jsonb('config').notNull(),
    configHash: varchar('config_hash', { length: RUN_HASH_LENGTH }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'strategy_versions_strategy_id_user_id_fk',
      columns: [table.strategyId, table.userId],
      foreignColumns: [strategies.id, strategies.userId],
    }).onDelete('restrict'),
    unique('strategy_versions_id_user_id_unique').on(table.id, table.userId),
    uniqueIndex('strategy_versions_strategy_id_version_unique').on(table.strategyId, table.version),
    uniqueIndex('strategy_versions_strategy_id_config_hash_unique').on(
      table.strategyId,
      table.configHash,
    ),
    index('strategy_versions_user_id_strategy_id_idx').on(table.userId, table.strategyId),
    check('strategy_versions_version_positive_check', sql`${table.version} >= 1`),
    check(
      'strategy_versions_config_hash_format_check',
      sql`${table.configHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
