// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountPageCursor,
  AdminAccountRecord,
  AdminAccountRepository,
} from '@crypto/database';
import { IDENTITY_OUTCOME, type IdentityAdminClient } from '@crypto/identity-admin';

import { encodeAccountCursor } from './account-cursor.js';

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

async function toAccountView(
  identity: ListAccountsDependencies['identity'],
  record: AdminAccountRecord,
): Promise<AccountView> {
  const outcome = await identity.readEmail(record.keycloakSubject);
  const email = outcome.status === IDENTITY_OUTCOME.OK ? outcome.value : undefined;
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
    const items = await Promise.all(
      page.items.map((record) => toAccountView(dependencies.identity, record)),
    );
    const lastRecord = page.items.at(-1);
    const nextCursor =
      page.hasMore && lastRecord !== undefined ? encodeAccountCursor(lastRecord) : null;
    return { items, nextCursor, perPage: limit };
  };
}
