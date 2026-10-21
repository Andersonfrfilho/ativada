// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { userIdFromDatabase } from '../ownership/user-id.js';
import { readUserRunLimits } from '../run-queue/run-limits.js';
import { users } from '../schema/users.schema.js';
import { DISPLAY_CURRENCY, type DisplayCurrency } from './display-currency.constant.js';
import type { ProfilePatch, ProfileRecord } from './profile.types.js';

export type ProfileRepository = {
  readonly findProfile: (scope: OwnerScope) => Promise<ProfileRecord | undefined>;
  readonly updateProfile: (
    scope: OwnerScope,
    patch: ProfilePatch,
  ) => Promise<ProfileRecord | undefined>;
};

type ProfileRow = {
  readonly id: string;
  readonly displayName: string | null;
  readonly displayCurrency: string;
  readonly timezone: string;
  readonly alertTelegramEnabled: boolean;
  readonly telegramChatId: string | null;
  readonly limits: unknown;
  readonly createdAt: Date;
};

const PROFILE_COLUMNS = {
  id: users.id,
  displayName: users.displayName,
  displayCurrency: users.displayCurrency,
  timezone: users.timezone,
  alertTelegramEnabled: users.alertTelegramEnabled,
  telegramChatId: users.telegramChatId,
  limits: users.limits,
  createdAt: users.createdAt,
} as const;

function toDisplayCurrency(value: string): DisplayCurrency {
  return value === DISPLAY_CURRENCY.USD ? DISPLAY_CURRENCY.USD : DISPLAY_CURRENCY.BRL;
}

function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    id: userIdFromDatabase(row.id),
    displayName: row.displayName ?? undefined,
    displayCurrency: toDisplayCurrency(row.displayCurrency),
    timezone: row.timezone,
    alertTelegramEnabled: row.alertTelegramEnabled,
    isTelegramLinked: row.telegramChatId !== null,
    maxActiveLivePaperRuns: readUserRunLimits(row.limits).maxActiveLivePaperRuns,
    createdAt: row.createdAt,
  };
}

async function selectProfile(
  database: BunSQLDatabase,
  scope: OwnerScope,
): Promise<ProfileRecord | undefined> {
  const rows = await database
    .select(PROFILE_COLUMNS)
    .from(users)
    .where(ownerCondition(scope, users.id))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toProfileRecord(row);
}

async function applyPatch(
  database: BunSQLDatabase,
  scope: OwnerScope,
  patch: ProfilePatch,
): Promise<ProfileRecord | undefined> {
  const rows = await database
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownerCondition(scope, users.id))
    .returning(PROFILE_COLUMNS);
  const row = rows[0];
  return row === undefined ? undefined : toProfileRecord(row);
}

export function createProfileRepository(handle: DatabaseHandle): ProfileRepository {
  const { database } = readOpenDatabase(handle);
  return {
    findProfile: (scope) => selectProfile(database, scope),
    updateProfile: (scope, patch) => applyPatch(database, scope, patch),
  };
}
