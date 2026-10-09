// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountId,
  BlockedAccount,
  BlockedAccountRepository,
  BlockedAccountsPage,
} from '../../packages/database/src/index.js';
import { parseAccountId } from '../../packages/database/src/index.js';

export type InMemoryBlockedAccountStore = {
  readonly repository: BlockedAccountRepository;
  readonly accounts: Map<AccountId, { keycloakSubject: string; isBlocked: boolean }>;
  readonly seed: (params: SeedBlockedAccountParams) => AccountId;
};

export type SeedBlockedAccountParams = {
  readonly id: string;
  readonly subject: string;
  readonly isBlocked: boolean;
};

export function createInMemoryBlockedAccountStore(): InMemoryBlockedAccountStore {
  const accounts = new Map<AccountId, { keycloakSubject: string; isBlocked: boolean }>();
  const repository: BlockedAccountRepository = {
    listBlockedAccounts: ({ limit, after }): Promise<BlockedAccountsPage> => {
      const blocked: BlockedAccount[] = [...accounts.entries()]
        .filter(([id, account]) => account.isBlocked && (after === undefined || id > after))
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([id, account]) => ({ id, keycloakSubject: account.keycloakSubject }));
      const accountsOfPage = blocked.slice(0, limit);
      const last = accountsOfPage.at(-1);
      const nextCursor = accountsOfPage.length === limit ? last?.id : undefined;
      return Promise.resolve({ accounts: accountsOfPage, nextCursor });
    },
    isStillBlocked: (accountId) => Promise.resolve(accounts.get(accountId)?.isBlocked === true),
  };
  return {
    repository,
    accounts,
    seed: (params): AccountId => {
      const id = parseAccountId(params.id);
      if (id === undefined) throw new Error('id de teste fora do formato UUID');
      accounts.set(id, { keycloakSubject: params.subject, isBlocked: params.isBlocked });
      return id;
    },
  };
}
