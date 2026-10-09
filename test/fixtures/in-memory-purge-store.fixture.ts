// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountPurgeRepository,
  PendingAccount,
  PendingAccountCursor,
  PendingAccountsPage,
} from '../../packages/database/src/index.js';
import { AccountNotDeletedError } from '../../packages/database/src/account/account-purge.error.js';
import { createOwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import {
  OWNED_TABLE_DELETION_ORDER,
  tableNameOf,
} from '../../packages/database/src/ownership/ownership-registry.js';
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
  readonly failures: {
    readonly purgeDataOnce: Set<UserId>;
    readonly purgeDataAlways: Set<UserId>;
    readonly removalOnce: Set<UserId>;
  };
  readonly stats: { peakConcurrentPurges: number };
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

// Espelha o WHERE e a ordem do repositório real; o SQL é provado em `make database-test`.
function isActionable(account: PendingAccount, removableBefore: Date): boolean {
  return (
    account.identityDeletedAt === undefined ||
    account.dataPurgedAt === undefined ||
    account.deletedAt.getTime() <= removableBefore.getTime()
  );
}

function isAfterCursor(account: PendingAccount, after: PendingAccountCursor | undefined): boolean {
  if (after === undefined) return true;
  const difference = account.deletedAt.getTime() - after.deletedAt.getTime();
  return difference > 0 || (difference === 0 && account.scope.ownerUserId > after.id);
}

function compareByCursor(left: PendingAccount, right: PendingAccount): number {
  const difference = left.deletedAt.getTime() - right.deletedAt.getTime();
  if (difference !== 0) return difference;
  return left.scope.ownerUserId < right.scope.ownerUserId ? -1 : 1;
}

export function createInMemoryPurgeStore(params: {
  readonly events: string[];
  readonly now: () => number;
}): InMemoryPurgeStore {
  const accounts = new Map<UserId, PurgeStoreAccount>();
  const ownedRows: OwnedRow[] = [];
  const auditLog: PurgeStoreAuditEvent[] = [];
  const failures = {
    purgeDataOnce: new Set<UserId>(),
    purgeDataAlways: new Set<UserId>(),
    removalOnce: new Set<UserId>(),
  };
  const stats = { peakConcurrentPurges: 0 };
  let concurrentPurges = 0;
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
    listAccountsPendingPurge: ({ limit, removableBefore, after }): Promise<PendingAccountsPage> => {
      const accountsOfPage = [...accounts.values()]
        .flatMap(toPending)
        .filter(
          (account) => isActionable(account, removableBefore) && isAfterCursor(account, after),
        )
        .sort(compareByCursor)
        .slice(0, limit);
      const last = accountsOfPage.at(-1);
      const nextCursor =
        accountsOfPage.length === limit && last !== undefined
          ? { deletedAt: last.deletedAt, id: last.scope.ownerUserId }
          : undefined;
      return Promise.resolve({ accounts: accountsOfPage, nextCursor });
    },
    markIdentityDeleted: (scope): Promise<void> => {
      const account = requireDeleted(scope.ownerUserId);
      account.identityDeletedAt ??= new Date(now());
      events.push(`database:identity-deleted:${account.id}`);
      return Promise.resolve();
    },
    purgeAccountData: async (scope): Promise<void> => {
      const account = requireDeleted(scope.ownerUserId);
      concurrentPurges += 1;
      stats.peakConcurrentPurges = Math.max(stats.peakConcurrentPurges, concurrentPurges);
      await Bun.sleep(1);
      concurrentPurges -= 1;
      if (failures.purgeDataAlways.has(account.id) || failures.purgeDataOnce.delete(account.id)) {
        throw new Error('purge failed on purpose');
      }
      account.displayName = undefined;
      for (const table of OWNED_TABLE_DELETION_ORDER) {
        const name = tableNameOf(table);
        const remaining = ownedRows.filter(
          (row) => !(row.table === name && row.userId === account.id),
        );
        ownedRows.splice(0, ownedRows.length, ...remaining);
        events.push(`database:purge:${name}:${account.id}`);
      }
      pseudonymize(account.id);
      account.dataPurgedAt ??= new Date(now());
      events.push(`database:data-purged:${account.id}`);
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
    stats,
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
        ownedRows.push({ table: tableNameOf(table), userId });
      }
    },
  };
}
