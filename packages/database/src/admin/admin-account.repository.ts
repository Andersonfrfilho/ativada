// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { users } from '../schema/users.schema.js';
import { INVALID_USER_ID_MESSAGE, parseAccountId, type AccountId } from './admin-account-id.js';
import type { AccountPage, AdminAccountRecord, ListAccountsParams } from './admin-account.types.js';

export type AdminAccountRepository = {
  readonly listAccounts: (params: ListAccountsParams) => Promise<AccountPage>;
  readonly findAccount: (accountId: AccountId) => Promise<AdminAccountRecord | undefined>;
  readonly findAccountBySubject: (subject: string) => Promise<AdminAccountRecord | undefined>;
  readonly markBlocked: (accountId: AccountId) => Promise<AdminAccountRecord | undefined>;
  readonly markUnblocked: (accountId: AccountId) => Promise<AdminAccountRecord | undefined>;
};

type AccountRow = {
  readonly id: string;
  readonly keycloakSubject: string;
  readonly createdAt: Date;
  readonly blockedAt: Date | null;
  readonly deletedAt: Date | null;
};

const ACCOUNT_COLUMNS = {
  id: users.id,
  keycloakSubject: users.keycloakSubject,
  createdAt: users.createdAt,
  blockedAt: users.blockedAt,
  deletedAt: users.deletedAt,
} as const;

function toAccountRecord(row: AccountRow): AdminAccountRecord {
  const id = parseAccountId(row.id);
  if (id === undefined) throw new Error(INVALID_USER_ID_MESSAGE);
  return {
    id,
    keycloakSubject: row.keycloakSubject,
    createdAt: row.createdAt,
    blockedAt: row.blockedAt ?? undefined,
    deletedAt: row.deletedAt ?? undefined,
  };
}

function firstRecord(rows: readonly AccountRow[]): AdminAccountRecord | undefined {
  const row = rows[0];
  return row === undefined ? undefined : toAccountRecord(row);
}

const CREATED_AT_MILLISECONDS = sql<Date>`date_trunc('milliseconds', ${users.createdAt})`;

async function selectPage(
  database: BunSQLDatabase,
  params: ListAccountsParams,
): Promise<AccountPage> {
  const { after } = params;
  const afterCondition =
    after === undefined
      ? undefined
      : or(
          gt(CREATED_AT_MILLISECONDS, after.createdAt),
          and(eq(CREATED_AT_MILLISECONDS, after.createdAt), gt(users.id, after.id)),
        );
  const rows = await database
    .select(ACCOUNT_COLUMNS)
    .from(users)
    .where(afterCondition)
    .orderBy(asc(CREATED_AT_MILLISECONDS), asc(users.id))
    .limit(params.limit + 1);
  return {
    items: rows.slice(0, params.limit).map(toAccountRecord),
    hasMore: rows.length > params.limit,
  };
}

async function selectWhere(
  database: BunSQLDatabase,
  condition: ReturnType<typeof eq>,
): Promise<AdminAccountRecord | undefined> {
  return firstRecord(await database.select(ACCOUNT_COLUMNS).from(users).where(condition).limit(1));
}

async function updateBlockedAt(
  database: BunSQLDatabase,
  accountId: AccountId,
  blockedAtValue: ReturnType<typeof sql> | null,
): Promise<AdminAccountRecord | undefined> {
  const rows = await database
    .update(users)
    .set({ blockedAt: blockedAtValue, updatedAt: new Date() })
    .where(and(eq(users.id, accountId), isNull(users.deletedAt)))
    .returning(ACCOUNT_COLUMNS);
  return firstRecord(rows);
}

export function createAdminAccountRepository(handle: DatabaseHandle): AdminAccountRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listAccounts: (params) => selectPage(database, params),
    findAccount: (accountId) => selectWhere(database, eq(users.id, accountId)),
    findAccountBySubject: (subject) => selectWhere(database, eq(users.keycloakSubject, subject)),
    markBlocked: (accountId) =>
      updateBlockedAt(database, accountId, sql`coalesce(${users.blockedAt}, now())`),
    markUnblocked: (accountId) => updateBlockedAt(database, accountId, null),
  };
}
