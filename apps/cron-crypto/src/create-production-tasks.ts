// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAuditRetentionRepository,
  createBlockedAccountRepository,
  createCandleRepository,
} from '@crypto/database';
import { createMarketDataClient } from '@crypto/market-data';

import {
  createProductionIdentityAdmin,
  createProductionPurgeTask,
  type CreatePurgeTaskParams,
} from './accounts/create-purge-deleted-accounts-task.js';
import { createReconcileBlockedAccountsTask } from './accounts/reconcile-blocked-accounts.task.js';
import { createExpireAuditEventsTask } from './audit/expire-audit-events.task.js';
import { TASK_NAME } from './cron.constant.js';
import { createBackfillCandlesTask } from './market/backfill-candles.task.js';
import type { CronTask } from './run-cron-tasks.js';
import { selectCronTasks } from './select-cron-tasks.js';

export function createProductionTasks(params: CreatePurgeTaskParams): readonly CronTask[] {
  const { environment, database, logger } = params;
  const tasks: readonly CronTask[] = [
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
    {
      name: TASK_NAME.BACKFILL_CANDLES,
      run: createBackfillCandlesTask({
        repository: createCandleRepository(database),
        client: createMarketDataClient({ baseUrl: environment.BINANCE_BASE_URL }),
        logger,
        now: () => Date.now(),
        exchange: environment.MARKET_EXCHANGE,
        symbols: environment.MARKET_SYMBOLS,
        timeframes: environment.MARKET_TIMEFRAMES,
        years: environment.BACKFILL_YEARS,
      }),
    },
  ];
  return selectCronTasks({ tasks, names: environment.CRON_TASKS });
}
