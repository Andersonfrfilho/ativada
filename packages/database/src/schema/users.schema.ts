// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const KEYCLOAK_SUBJECT_MAX_LENGTH = 255;

export const DEFAULT_USER_LIMITS = {
  maxActiveLivePaperRuns: 5,
  maxConcurrentWalkForwards: 1,
  maxActivePriceAlerts: 50,
} as const;

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    keycloakSubject: varchar('keycloak_sub', { length: KEYCLOAK_SUBJECT_MAX_LENGTH }).notNull(),
    displayName: varchar('display_name', { length: 120 }),
    displayCurrency: varchar('display_currency', { length: 3 }).notNull().default('BRL'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
    telegramChatId: varchar('telegram_chat_id', { length: 32 }),
    alertTelegramEnabled: boolean('alert_telegram_enabled').notNull().default(true),
    limits: jsonb('limits').notNull().default(DEFAULT_USER_LIMITS),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    identityDeletedAt: timestamp('identity_deleted_at', { withTimezone: true }),
    dataPurgedAt: timestamp('data_purged_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_keycloak_sub_unique').on(table.keycloakSubject),
    uniqueIndex('users_telegram_chat_id_unique')
      .on(table.telegramChatId)
      .where(sql`${table.telegramChatId} is not null`),
  ],
);
