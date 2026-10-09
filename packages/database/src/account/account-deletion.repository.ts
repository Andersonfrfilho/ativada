// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { users } from '../schema/users.schema.js';

export type AccountDeletionRepository = {
  readonly markDeleted: (scope: OwnerScope) => Promise<Date | undefined>;
};

// Passo 1 da exclusão (ADR 0001 §h): repetir não move a data original.
async function markDeletedAt(
  database: BunSQLDatabase,
  scope: OwnerScope,
): Promise<Date | undefined> {
  const rows = await database
    .update(users)
    .set({ deletedAt: sql`coalesce(${users.deletedAt}, now())`, updatedAt: new Date() })
    .where(ownerCondition(scope, users.id))
    .returning({ deletedAt: users.deletedAt });
  return rows[0]?.deletedAt ?? undefined;
}

export function createAccountDeletionRepository(handle: DatabaseHandle): AccountDeletionRepository {
  const { database } = readOpenDatabase(handle);
  return { markDeleted: (scope) => markDeletedAt(database, scope) };
}
