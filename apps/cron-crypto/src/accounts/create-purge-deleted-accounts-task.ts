// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountPurgeRepository, type DatabaseHandle } from '@crypto/database';
import { createKeycloakIdentityAdmin } from '@crypto/identity-admin';

import { ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS } from '../cron.constant.js';
import type { Environment } from '../environment.js';
import type { CronLogger } from '../logging/cron-logger.js';
import {
  createPurgeDeletedAccountsTask,
  type PurgeDeletedAccountsTask,
} from './purge-deleted-accounts.task.js';

export type CreatePurgeTaskParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly logger: CronLogger;
};

export function createProductionPurgeTask(params: CreatePurgeTaskParams): PurgeDeletedAccountsTask {
  const { environment, database, logger } = params;
  return createPurgeDeletedAccountsTask({
    repository: createAccountPurgeRepository(database),
    identity: createKeycloakIdentityAdmin({
      adminApiUrl: environment.KEYCLOAK_ADMIN_API_URL,
      tokenUrl: environment.KEYCLOAK_TOKEN_URL,
      clientId: environment.KEYCLOAK_SERVICE_CLIENT_ID,
      clientSecret: environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
      now: () => Date.now(),
    }),
    logger,
    now: () => Date.now(),
    gracePeriodMilliseconds: ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS,
  });
}
