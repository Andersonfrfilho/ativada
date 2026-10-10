// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAdminAccountRepository,
  createAuditEventRepository,
  type DatabaseHandle,
} from '@cryptoada/database';
import type { IdentityAdminClient } from '@cryptoada/identity-admin';

import { createAdminAuditRecorder } from './admin-audit-recorder.js';
import type { AdminRouteDependencies } from './admin.routes.js';
import {
  createBlockAccountUseCase,
  createUnblockAccountUseCase,
} from './block-account.use-case.js';
import { createInviteUserUseCase } from './invite-user.use-case.js';
import { createListAccountsUseCase } from './list-accounts.use-case.js';

export type CreateAdminRouteDependenciesParams = {
  readonly identity: IdentityAdminClient;
  readonly database: DatabaseHandle;
  readonly closeUserSockets: (userId: string) => void;
};

export function createAdminRouteDependencies(
  params: CreateAdminRouteDependenciesParams,
): AdminRouteDependencies {
  const { identity, database, closeUserSockets } = params;
  const accounts = createAdminAccountRepository(database);
  const audit = createAdminAuditRecorder(createAuditEventRepository(database));
  const accountState = { accounts, identity, audit, onAccountBlocked: closeUserSockets };
  return {
    inviteUser: createInviteUserUseCase({ identity, accounts, audit }),
    listAccounts: createListAccountsUseCase({ accounts, identity }),
    blockAccount: createBlockAccountUseCase(accountState),
    unblockAccount: createUnblockAccountUseCase(accountState),
  };
}
