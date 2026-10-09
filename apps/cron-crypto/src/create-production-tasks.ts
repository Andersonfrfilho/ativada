// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAuditRetentionRepository, createBlockedAccountRepository } from '@crypto/database';

import {
  createProductionIdentityAdmin,
  createProductionPurgeTask,
  type CreatePurgeTaskParams,
} from './accounts/create-purge-deleted-accounts-task.js';
import { createReconcileBlockedAccountsTask } from './accounts/reconcile-blocked-accounts.task.js';
import { createExpireAuditEventsTask } from './audit/expire-audit-events.task.js';
import { TASK_NAME } from './cron.constant.js';
import type { CronTask } from './run-cron-tasks.js';

export function createProductionTasks(params: CreatePurgeTaskParams): readonly CronTask[] {
  const { environment, database, logger } = params;
  return [
    { name: TASK_NAME.PURGE_DELETED_ACCOUNTS, run: createProductionPurgeTask(params) },
    {
      name: TASK_NAME.RECONCILE_BLOCKED_ACCOUNTS,
      run: createReconcileBlockedAccountsTask({
        repository: createBlockedAccountRepository(database),
        identity: createProductionIdentityAdmin(environment),
        logger,
      }),
    },
    {
      name: TASK_NAME.EXPIRE_AUDIT_EVENTS,
      run: createExpireAuditEventsTask({
        repository: createAuditRetentionRepository(database),
        now: () => Date.now(),
      }),
    },
  ];
}
