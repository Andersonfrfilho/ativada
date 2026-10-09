// Copyright (c) 2026 Ada Technology. All rights reserved.
import { index, inet, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.schema.js';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorKind: varchar('actor_kind', { length: 16 }).notNull(),
    targetKind: varchar('target_kind', { length: 32 }).notNull(),
    targetId: uuid('target_id'),
    action: varchar('action', { length: 64 }).notNull(),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull().default({}),
  },
  (table) => [
    index('audit_events_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('audit_events_target_created_idx').on(table.targetKind, table.targetId, table.createdAt),
  ],
);
