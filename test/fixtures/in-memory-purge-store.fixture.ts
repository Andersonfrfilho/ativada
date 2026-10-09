// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableName } from '../../packages/database/node_modules/drizzle-orm/index.js';
import type { AccountPurgeRepository, PendingAccount } from '../../packages/database/src/index.js';
import { AccountNotDeletedError } from '../../packages/database/src/account/account-purge.error.js';
import { createOwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import { OWNED_TABLE_DELETION_ORDER } from '../../packages/database/src/ownership/ownership-registry.js';
import { userIdFromDatabase, type UserId } from '../../packages/database/src/ownership/user-id.js';

export type PurgeStoreAccount = {
  readonly id: UserId;
  readonly keycloakSubject: string;
  readonly deletedAt: Date | undefined;
  identityDeletedAt: Date | undefined;
  dataPurgedAt: Date | undefined;
  displayName: string | undefined;
};

export type PurgeStoreAuditEvent = {
  readonly action: string;
  actorUserId: UserId | undefined;
  targetId: UserId | undefined;
  ip: string | undefined;
  readonly createdAt: Date;
};

export type OwnedRow = { readonly table: string; readonly userId: UserId };

export type SeedAccountParams = {
  readonly id: string;
  readonly subject: string;
  readonly deletedAt?: Date;
  readonly identityDeletedAt?: Date;
  readonly dataPurgedAt?: Date;
};

export type InMemoryPurgeStore = {
  readonly repository: AccountPurgeRepository;
  readonly accounts: Map<UserId, PurgeStoreAccount>;
  readonly ownedRows: OwnedRow[];
  readonly auditLog: PurgeStoreAuditEvent[];
  readonly failures: { readonly purgeDataOnce: Set<UserId>; readonly removalOnce: Set<UserId> };
  readonly clock: { now: () => number };
  readonly seedAccount: (params: SeedAccountParams) => PurgeStoreAccount;
  readonly seedOwnedRowsForEveryTable: (userId: UserId) => void;
};

function toPending(account: PurgeStoreAccount): PendingAccount[] {
  if (account.deletedAt === undefined) return [];
  return [
    {
      scope: createOwnerScope(account.id),
      keycloakSubject: account.keycloakSubject,
      deletedAt: account.deletedAt,
      identityDeletedAt: account.identityDeletedAt,
      dataPurgedAt: account.dataPurgedAt,
    },
  ];
}

export function createInMemoryPurgeStore(params: {
  readonly events: string[];
  readonly now: () => number;
}): InMemoryPurgeStore {
  const accounts = new Map<UserId, PurgeStoreAccount>();
  const ownedRows: OwnedRow[] = [];
  const auditLog: PurgeStoreAuditEvent[] = [];
  const failures = { purgeDataOnce: new Set<UserId>(), removalOnce: new Set<UserId>() };
  const { events, now } = params;

  function requireDeleted(id: UserId): PurgeStoreAccount {
    const account = accounts.get(id);
    if (account?.deletedAt === undefined) throw new AccountNotDeletedError();
    return account;
  }

  function pseudonymize(id: UserId): void {
    for (const event of auditLog) {
      if (event.actorUserId !== id && event.targetId !== id) continue;
      if (event.actorUserId === id) event.ip = undefined;
      if (event.actorUserId === id) event.actorUserId = undefined;
      if (event.targetId === id) event.targetId = undefined;
    }
  }

  const repository: AccountPurgeRepository = {
    listAccountsPendingPurge: ({ limit }): Promise<readonly PendingAccount[]> =>
      Promise.resolve([...accounts.values()].flatMap(toPending).slice(0, limit)),
    markIdentityDeleted: (scope): Promise<void> => {
      const account = requireDeleted(scope.ownerUserId);
      account.identityDeletedAt ??= new Date(now());
      events.push(`database:identity-deleted:${account.id}`);
      return Promise.resolve();
    },
    purgeAccountData: (scope): Promise<void> => {
      const account = requireDeleted(scope.ownerUserId);
      if (failures.purgeDataOnce.delete(account.id)) {
        return Promise.reject(new Error('purge failed on purpose'));
      }
      account.displayName = undefined;
      for (const table of OWNED_TABLE_DELETION_ORDER) {
        const name = getTableName(table);
        const remaining = ownedRows.filter(
          (row) => !(row.table === name && row.userId === account.id),
        );
        ownedRows.splice(0, ownedRows.length, ...remaining);
        events.push(`database:purge:${name}:${account.id}`);
      }
      pseudonymize(account.id);
      account.dataPurgedAt ??= new Date(now());
      events.push(`database:data-purged:${account.id}`);
      return Promise.resolve();
    },
    removeUserRow: (scope, { deletedBefore }): Promise<boolean> => {
      const account = accounts.get(scope.ownerUserId);
      if (failures.removalOnce.delete(scope.ownerUserId)) {
        return Promise.reject(new Error('removal failed on purpose'));
      }
      const isRemovable =
        account?.deletedAt !== undefined &&
        account.identityDeletedAt !== undefined &&
        account.dataPurgedAt !== undefined &&
        account.deletedAt.getTime() <= deletedBefore.getTime();
      if (!isRemovable) return Promise.resolve(false);
      accounts.delete(account.id);
      events.push(`database:removed:${account.id}`);
      return Promise.resolve(true);
    },
    expireAuditIps: (olderThan): Promise<number> => {
      let expired = 0;
      for (const event of auditLog) {
        if (event.ip === undefined || event.createdAt.getTime() > olderThan.getTime()) continue;
        event.ip = undefined;
        expired += 1;
      }
      return Promise.resolve(expired);
    },
  };

  return {
    repository,
    accounts,
    ownedRows,
    auditLog,
    failures,
    clock: { now },
    seedAccount: (seed): PurgeStoreAccount => {
      const account: PurgeStoreAccount = {
        id: userIdFromDatabase(seed.id),
        keycloakSubject: seed.subject,
        deletedAt: seed.deletedAt,
        identityDeletedAt: seed.identityDeletedAt,
        dataPurgedAt: seed.dataPurgedAt,
        displayName: 'Personal Name',
      };
      accounts.set(account.id, account);
      return account;
    },
    seedOwnedRowsForEveryTable: (userId): void => {
      for (const table of OWNED_TABLE_DELETION_ORDER) {
        ownedRows.push({ table: getTableName(table), userId });
      }
    },
  };
}
