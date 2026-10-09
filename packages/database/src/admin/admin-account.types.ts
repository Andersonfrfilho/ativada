// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountId } from './admin-account-id.js';

export type AdminAccountRecord = {
  readonly id: AccountId;
  readonly keycloakSubject: string;
  readonly createdAt: Date;
  readonly blockedAt: Date | undefined;
  readonly deletedAt: Date | undefined;
};

export type AccountPageCursor = {
  readonly createdAt: Date;
  readonly id: AccountId;
};

export type ListAccountsParams = {
  readonly after: AccountPageCursor | undefined;
  readonly limit: number;
};

export type AccountPage = {
  readonly items: readonly AdminAccountRecord[];
  readonly hasMore: boolean;
};
