// Copyright (c) 2026 Ada Technology. All rights reserved.
import { eq } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { createOwnerScope, type OwnerScope } from '../ownership/owner-scope.js';
import { userIdFromDatabase, type UserId } from '../ownership/user-id.js';
import { users } from '../schema/users.schema.js';
import { USER_RESOLUTION_STATUS } from './user-resolution.constant.js';
import { UserResolutionError } from './user-resolution.error.js';

export type UserResolution =
  | {
      readonly status: typeof USER_RESOLUTION_STATUS.ACTIVE;
      readonly userId: UserId;
      readonly scope: OwnerScope;
    }
  | { readonly status: typeof USER_RESOLUTION_STATUS.DELETED }
  | { readonly status: typeof USER_RESOLUTION_STATUS.BLOCKED };

type UserRow = {
  readonly id: string;
  readonly deletedAt: Date | null;
  readonly blockedAt: Date | null;
};

async function selectUserBySubject(
  database: BunSQLDatabase,
  subject: string,
): Promise<UserRow | undefined> {
  const rows = await database
    .select({ id: users.id, deletedAt: users.deletedAt, blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.keycloakSubject, subject))
    .limit(1);
  return rows[0];
}

async function insertUserIfAbsent(database: BunSQLDatabase, subject: string): Promise<void> {
  await database
    .insert(users)
    .values({ id: Bun.randomUUIDv7(), keycloakSubject: subject })
    .onConflictDoNothing({ target: users.keycloakSubject });
}

function toResolution(row: UserRow): UserResolution {
  if (row.deletedAt !== null) return { status: USER_RESOLUTION_STATUS.DELETED };
  if (row.blockedAt !== null) return { status: USER_RESOLUTION_STATUS.BLOCKED };
  const userId = userIdFromDatabase(row.id);
  return { status: USER_RESOLUTION_STATUS.ACTIVE, userId, scope: createOwnerScope(userId) };
}

export async function resolveUserBySubject(
  handle: DatabaseHandle,
  subject: string,
): Promise<UserResolution> {
  const { database } = readOpenDatabase(handle);
  const existingRow = await selectUserBySubject(database, subject);
  if (existingRow !== undefined) return toResolution(existingRow);

  await insertUserIfAbsent(database, subject);
  const rereadRow = await selectUserBySubject(database, subject);
  if (rereadRow === undefined) throw new UserResolutionError();
  return toResolution(rereadRow);
}
