// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { parseAccountId, type AccountId } from '../admin/admin-account-id.js';
import { users } from '../schema/users.schema.js';

export type BlockedAccount = {
  readonly id: AccountId;
  readonly keycloakSubject: string;
};

export type ListBlockedAccountsParams = {
  readonly limit: number;
  readonly after: AccountId | undefined;
};

export type BlockedAccountsPage = {
  readonly accounts: readonly BlockedAccount[];
  readonly nextCursor: AccountId | undefined;
};

export type BlockedAccountRepository = {
  readonly listBlockedAccounts: (params: ListBlockedAccountsParams) => Promise<BlockedAccountsPage>;
  readonly isStillBlocked: (accountId: AccountId) => Promise<boolean>;
};

function toBlockedAccount(row: {
  readonly id: string;
  readonly keycloakSubject: string;
}): BlockedAccount {
  const id = parseAccountId(row.id);
  if (id === undefined) throw new Error('users.id fora do formato UUID em minúsculas');
  return { id, keycloakSubject: row.keycloakSubject };
}

export function createBlockedAccountRepository(handle: DatabaseHandle): BlockedAccountRepository {
  const { database } = readOpenDatabase(handle);
  const isBlocked = and(isNotNull(users.blockedAt), isNull(users.deletedAt));
  return {
    listBlockedAccounts: async ({ limit, after }): Promise<BlockedAccountsPage> => {
      const rows = await database
        .select({ id: users.id, keycloakSubject: users.keycloakSubject })
        .from(users)
        .where(and(isBlocked, after === undefined ? undefined : gt(users.id, after)))
        .orderBy(asc(users.id))
        .limit(limit);
      const accounts = rows.map(toBlockedAccount);
      const last = accounts.at(-1);
      return { accounts, nextCursor: accounts.length === limit ? last?.id : undefined };
    },
    isStillBlocked: async (accountId): Promise<boolean> => {
      const rows = await database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, accountId), isBlocked))
        .limit(1);
      return rows.length > 0;
    },
  };
}
