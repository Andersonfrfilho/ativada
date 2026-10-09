// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';

export type PendingAccount = {
  readonly scope: OwnerScope;
  readonly keycloakSubject: string;
  readonly deletedAt: Date;
  readonly identityDeletedAt: Date | undefined;
  readonly dataPurgedAt: Date | undefined;
};

export type PendingAccountCursor = {
  readonly deletedAt: Date;
  readonly id: string;
};

export type ListPendingAccountsParams = {
  readonly limit: number;
  readonly removableBefore: Date;
  readonly after: PendingAccountCursor | undefined;
};

export type PendingAccountsPage = {
  readonly accounts: readonly PendingAccount[];
  readonly nextCursor: PendingAccountCursor | undefined;
};

export type RemoveUserRowParams = {
  readonly deletedBefore: Date;
};
