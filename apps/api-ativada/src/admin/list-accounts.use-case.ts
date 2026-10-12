// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountPageCursor,
  AdminAccountRecord,
  AdminAccountRepository,
} from '@ativada/database';
import { IDENTITY_OUTCOME, mapInBatches, type IdentityAdminClient } from '@ativada/identity-admin';

import { encodeAccountCursor } from './account-cursor.js';
import { LIST_ACCOUNTS_BATCH_SIZE } from './admin.constant.js';

export type ListAccountsInput = {
  readonly after: AccountPageCursor | undefined;
  readonly limit: number;
};

export type AccountView = {
  readonly id: string;
  readonly createdAt: string;
  readonly blockedAt: string | null;
  readonly deletedAt: string | null;
  readonly email: string | null;
};

export type AccountListResult = {
  readonly items: readonly AccountView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type ListAccountsUseCase = (input: ListAccountsInput) => Promise<AccountListResult>;

export type ListAccountsDependencies = {
  readonly accounts: Pick<AdminAccountRepository, 'listAccounts'>;
  readonly identity: Pick<IdentityAdminClient, 'readEmail'>;
};

async function readEmail(
  identity: ListAccountsDependencies['identity'],
  record: AdminAccountRecord,
): Promise<string | undefined> {
  const outcome = await identity.readEmail(record.keycloakSubject);
  return outcome.status === IDENTITY_OUTCOME.OK ? outcome.value : undefined;
}

function toAccountView(record: AdminAccountRecord, email: string | undefined): AccountView {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    blockedAt: record.blockedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    email: email ?? null,
  };
}

export function createListAccountsUseCase(
  dependencies: ListAccountsDependencies,
): ListAccountsUseCase {
  return async ({ after, limit }) => {
    const page = await dependencies.accounts.listAccounts({ after, limit });
    const emails = await mapInBatches(page.items, LIST_ACCOUNTS_BATCH_SIZE, (record) =>
      readEmail(dependencies.identity, record),
    );
    const items = page.items.map((record, index) => {
      const email = emails[index];
      return toAccountView(record, email?.status === 'fulfilled' ? email.value : undefined);
    });
    const lastRecord = page.items.at(-1);
    const nextCursor =
      page.hasMore && lastRecord !== undefined ? encodeAccountCursor(lastRecord) : null;
    return { items, nextCursor, perPage: limit };
  };
}
