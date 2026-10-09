// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, getTableName, isNotNull, lte, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { createOwnerScope, ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import {
  OWNED_TABLE_DELETION_ORDER,
  OWNED_TABLES,
  PSEUDONYMIZED_TABLES,
} from '../ownership/ownership-registry.js';
import { userIdFromDatabase } from '../ownership/user-id.js';
import { auditEvents } from '../schema/audit-events.schema.js';
import { DEFAULT_USER_LIMITS, users } from '../schema/users.schema.js';
import {
  AccountNotDeletedError,
  OwnedTableWithoutDeletionStepError,
} from './account-purge.error.js';
import type {
  ListPendingAccountsParams,
  PendingAccount,
  RemoveUserRowParams,
} from './account-purge.types.js';
import { readUserIdColumn } from './owned-table-columns.js';
import { PSEUDONYMIZATION_STEPS } from './pseudonymization-steps.js';

export type AccountPurgeRepository = {
  readonly listAccountsPendingPurge: (
    params: ListPendingAccountsParams,
  ) => Promise<readonly PendingAccount[]>;
  readonly markIdentityDeleted: (scope: OwnerScope) => Promise<void>;
  readonly purgeAccountData: (scope: OwnerScope) => Promise<void>;
  readonly removeUserRow: (scope: OwnerScope, params: RemoveUserRowParams) => Promise<boolean>;
  readonly expireAuditIps: (olderThan: Date) => Promise<number>;
};

type PendingRow = {
  readonly id: string;
  readonly keycloakSubject: string;
  readonly deletedAt: Date | null;
  readonly identityDeletedAt: Date | null;
  readonly dataPurgedAt: Date | null;
};

function toPendingAccount(row: PendingRow): PendingAccount | undefined {
  if (row.deletedAt === null) return undefined;
  return {
    scope: createOwnerScope(userIdFromDatabase(row.id)),
    keycloakSubject: row.keycloakSubject,
    deletedAt: row.deletedAt,
    identityDeletedAt: row.identityDeletedAt ?? undefined,
    dataPurgedAt: row.dataPurgedAt ?? undefined,
  };
}

async function selectPending(
  database: BunSQLDatabase,
  params: ListPendingAccountsParams,
): Promise<readonly PendingAccount[]> {
  const rows = await database
    .select({
      id: users.id,
      keycloakSubject: users.keycloakSubject,
      deletedAt: users.deletedAt,
      identityDeletedAt: users.identityDeletedAt,
      dataPurgedAt: users.dataPurgedAt,
    })
    .from(users)
    .where(isNotNull(users.deletedAt))
    .orderBy(asc(users.deletedAt), asc(users.id))
    .limit(params.limit);
  return rows.flatMap((row) => toPendingAccount(row) ?? []);
}

async function setIdentityDeleted(database: BunSQLDatabase, scope: OwnerScope): Promise<void> {
  await database
    .update(users)
    .set({ identityDeletedAt: sql`coalesce(${users.identityDeletedAt}, now())` })
    .where(and(ownerCondition(scope, users.id), isNotNull(users.deletedAt)));
}

function assertRegistryIsCovered(): void {
  const covered = new Set(OWNED_TABLE_DELETION_ORDER.map(getTableName));
  for (const table of OWNED_TABLES) {
    if (!covered.has(getTableName(table))) {
      throw new OwnedTableWithoutDeletionStepError(getTableName(table));
    }
  }
}

async function purgeInTransaction(database: BunSQLDatabase, scope: OwnerScope): Promise<void> {
  assertRegistryIsCovered();
  await database.transaction(async (transaction) => {
    const anonymized = await transaction
      .update(users)
      .set({ displayName: null, telegramChatId: null, limits: DEFAULT_USER_LIMITS })
      .where(and(ownerCondition(scope, users.id), isNotNull(users.deletedAt)))
      .returning({ id: users.id });
    if (anonymized.length === 0) throw new AccountNotDeletedError();
    for (const table of OWNED_TABLE_DELETION_ORDER) {
      await transaction.delete(table).where(ownerCondition(scope, readUserIdColumn(table)));
    }
    for (const pseudonymized of PSEUDONYMIZED_TABLES) {
      const step = PSEUDONYMIZATION_STEPS[getTableName(pseudonymized.table)];
      if (step === undefined) throw new Error('Tabela pseudonimizada sem passo de pseudonimização');
      await step(transaction, scope.ownerUserId);
    }
    await transaction
      .update(users)
      .set({ dataPurgedAt: sql`coalesce(${users.dataPurgedAt}, now())` })
      .where(ownerCondition(scope, users.id));
  });
}

// Só remove com as duas colunas de estado preenchidas e passada a carência; a FK RESTRICT recusa o resto.
async function deleteUserRow(
  database: BunSQLDatabase,
  params: { readonly scope: OwnerScope } & RemoveUserRowParams,
): Promise<boolean> {
  const rows = await database
    .delete(users)
    .where(
      and(
        ownerCondition(params.scope, users.id),
        isNotNull(users.identityDeletedAt),
        isNotNull(users.dataPurgedAt),
        lte(users.deletedAt, params.deletedBefore),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

async function clearOldAuditIps(database: BunSQLDatabase, olderThan: Date): Promise<number> {
  const rows = await database
    .update(auditEvents)
    .set({ ip: null })
    .where(and(isNotNull(auditEvents.ip), lte(auditEvents.createdAt, olderThan)))
    .returning({ id: auditEvents.id });
  return rows.length;
}

export function createAccountPurgeRepository(handle: DatabaseHandle): AccountPurgeRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listAccountsPendingPurge: (params) => selectPending(database, params),
    markIdentityDeleted: (scope) => setIdentityDeleted(database, scope),
    purgeAccountData: (scope) => purgeInTransaction(database, scope),
    removeUserRow: (scope, params) => deleteUserRow(database, { scope, ...params }),
    expireAuditIps: (olderThan) => clearOldAuditIps(database, olderThan),
  };
}
