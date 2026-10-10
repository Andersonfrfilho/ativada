// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAccountDeletionRepository,
  createAccountExportRepository,
  createAuditEventRepository,
  type DatabaseHandle,
} from '@cryptoada/database';
import type { IdentityAdminClient } from '@cryptoada/identity-admin';

import type { AccountRouteDependencies } from './account.routes.js';
import { createDeleteAccountUseCase } from './delete-account.use-case.js';
import { createExportAccountUseCase } from './export-account.use-case.js';

export type CreateAccountRouteDependenciesParams = {
  readonly database: DatabaseHandle;
  readonly identity: IdentityAdminClient;
  readonly now: () => number;
};

export function createAccountRouteDependencies(
  params: CreateAccountRouteDependenciesParams,
): AccountRouteDependencies {
  const { database, identity, now } = params;
  return {
    exportAccount: createExportAccountUseCase({
      exports: createAccountExportRepository(database),
      identity,
      now,
    }),
    deleteAccount: createDeleteAccountUseCase({
      deletions: createAccountDeletionRepository(database),
      audit: createAuditEventRepository(database),
      identity,
      now,
    }),
  };
}
