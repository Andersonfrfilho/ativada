// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountPage,
  AdminAccountRecord,
  AdminAccountRepository,
  AuditEventInput,
  AuditEventRepository,
} from '../../packages/database/src/index.js';
import { parseAccountId } from '../../packages/database/src/admin/admin-account-id.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';
import type { StoredUser } from './in-memory-user-store.fixture.js';

export type InMemoryAdminStore = {
  readonly accounts: AdminAccountRepository;
  readonly audit: AuditEventRepository;
  readonly auditLog: AuditEventInput[];
};

function toRecord(user: StoredUser): AdminAccountRecord {
  const id = parseAccountId(user.id);
  if (id === undefined) throw new Error('id de usuário inválido no fixture');
  return {
    id,
    keycloakSubject: user.keycloakSubject,
    createdAt: user.createdAt,
    blockedAt: user.blockedAt,
    deletedAt: user.deletedAt,
  };
}

function compareAccounts(first: StoredUser, second: StoredUser): number {
  const byDate = first.createdAt.getTime() - second.createdAt.getTime();
  return byDate !== 0 ? byDate : first.id.localeCompare(second.id);
}

export function createInMemoryAdminStore(
  users: Map<UserId, StoredUser>,
  events: string[],
): InMemoryAdminStore {
  const auditLog: AuditEventInput[] = [];

  function findById(accountId: string): StoredUser | undefined {
    return [...users.values()].find((user) => user.id === accountId);
  }

  function update(
    accountId: string,
    apply: (user: StoredUser) => void,
  ): AdminAccountRecord | undefined {
    const user = findById(accountId);
    if (user === undefined || user.deletedAt !== undefined) return undefined;
    apply(user);
    return toRecord(user);
  }

  return {
    auditLog,
    accounts: {
      listAccounts: ({ after, limit }): Promise<AccountPage> => {
        const sorted = [...users.values()].sort(compareAccounts);
        const rest =
          after === undefined
            ? sorted
            : sorted.filter((user) => {
                const byDate = user.createdAt.getTime() - after.createdAt.getTime();
                return byDate > 0 || (byDate === 0 && user.id.localeCompare(after.id) > 0);
              });
        return Promise.resolve({
          items: rest.slice(0, limit).map(toRecord),
          hasMore: rest.length > limit,
        });
      },
      findAccount: (accountId): Promise<AdminAccountRecord | undefined> => {
        const user = findById(accountId);
        return Promise.resolve(user === undefined ? undefined : toRecord(user));
      },
      findAccountBySubject: (subject): Promise<AdminAccountRecord | undefined> => {
        const user = [...users.values()].find((entry) => entry.keycloakSubject === subject);
        return Promise.resolve(user === undefined ? undefined : toRecord(user));
      },
      markBlocked: (accountId): Promise<AdminAccountRecord | undefined> => {
        events.push(`database:blocked:${accountId}`);
        return Promise.resolve(
          update(accountId, (user) => {
            user.blockedAt ??= new Date();
          }),
        );
      },
      markUnblocked: (accountId): Promise<AdminAccountRecord | undefined> => {
        events.push(`database:unblocked:${accountId}`);
        return Promise.resolve(
          update(accountId, (user) => {
            user.blockedAt = undefined;
          }),
        );
      },
    },
    audit: {
      record: (event): Promise<void> => {
        auditLog.push(structuredClone(event));
        return Promise.resolve();
      },
    },
  };
}
