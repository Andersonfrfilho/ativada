// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAuditRetentionRepository,
  createBlockedAccountRepository,
  createCandleRepository,
  createSentimentRepository,
  createTeamReportRepository,
  MODEL_TEAM_RETENTION_DAYS,
} from '@ativada/database';
import {
  buildDisplayRetentionDays,
  createFearGreedClient,
  createMarketDataClient,
  createServerClock,
} from '@ativada/market-data-crypto';

import {
  createProductionIdentityAdmin,
  createProductionPurgeTask,
  type CreatePurgeTaskParams,
} from './accounts/create-purge-deleted-accounts-task.js';
import { createReconcileBlockedAccountsTask } from './accounts/reconcile-blocked-accounts.task.js';
import { createExpireAuditEventsTask } from './audit/expire-audit-events.task.js';
import { TASK_NAME } from './cron.constant.js';
import {
  createBackfillCandlesTask,
  type BackfillCandlesSummary,
  type BackfillCandlesTask,
} from './market/backfill-candles.task.js';
import { BACKFILL_LOG } from './market/market.constant.js';
import { createPurgeDisplayCandlesTask } from './market/purge-display-candles.task.js';
import { createExpireModelTeamReportsTask } from './model-teams/expire-model-team-reports.task.js';
import { createSyncFearGreedTask } from './market/sync-fear-greed.task.js';
import type { CronTask } from './run-cron-tasks.js';
import { selectCronTasks } from './select-cron-tasks.js';

type ServerClock = ReturnType<typeof createServerClock>;

function createBackfillTask(params: CreatePurgeTaskParams, serverClock: ServerClock): CronTask {
  const { environment, database, logger } = params;
  return {
    name: TASK_NAME.BACKFILL_CANDLES,
    run: createBackfillCandlesTask({
      repository: createCandleRepository(database),
      client: createMarketDataClient({
        baseUrl: environment.BINANCE_BASE_URL,
        clock: serverClock,
      }),
      logger,
      now: serverClock.now,
      refreshClock: serverClock.refresh,
      exchange: environment.MARKET_EXCHANGE,
      symbols: environment.MARKET_SYMBOLS,
      timeframes: environment.MARKET_TIMEFRAMES,
      years: environment.BACKFILL_YEARS,
    }),
  };
}

function createBackfillDisplayTask(
  params: CreatePurgeTaskParams,
  serverClock: ServerClock,
): CronTask {
  const { environment, database, logger } = params;
  const retentionDays = buildDisplayRetentionDays(environment);
  const client = createMarketDataClient({
    baseUrl: environment.BINANCE_BASE_URL,
    clock: serverClock,
  });
  // Uma tarefa por vela de exibição: cada uma tem a sua janela de retenção.
  const tasks = environment.MARKET_DISPLAY_TIMEFRAMES.map((timeframe) =>
    createBackfillCandlesTask({
      repository: createCandleRepository(database),
      client,
      logger,
      now: serverClock.now,
      refreshClock: serverClock.refresh,
      exchange: environment.MARKET_EXCHANGE,
      symbols: environment.MARKET_SYMBOLS,
      timeframes: [timeframe],
      days: retentionDays[timeframe],
    }),
  );
  return { name: TASK_NAME.BACKFILL_DISPLAY_CANDLES, run: () => runInSequence(tasks) };
}

async function runInSequence(
  tasks: readonly BackfillCandlesTask[],
): Promise<BackfillCandlesSummary> {
  const total = { pairs: 0, inserted: 0, unfillable: 0, failures: 0 };
  for (const task of tasks) {
    const summary = await task();
    total.pairs += summary.pairs;
    total.inserted += summary.inserted;
    total.unfillable += summary.unfillable;
    total.failures += summary.failures;
  }
  return total;
}

function createPurgeDisplayTask(params: CreatePurgeTaskParams): CronTask {
  const { environment, database } = params;
  return {
    name: TASK_NAME.PURGE_DISPLAY_CANDLES,
    run: createPurgeDisplayCandlesTask({
      repository: createCandleRepository(database),
      retentionDays: buildDisplayRetentionDays(environment),
      now: () => Date.now(),
    }),
  };
}

function createExpireModelTeamReportsCronTask(params: CreatePurgeTaskParams): CronTask {
  return {
    name: TASK_NAME.EXPIRE_MODEL_TEAM_REPORTS,
    run: createExpireModelTeamReportsTask({
      repository: createTeamReportRepository(params.database),
      retentionDays: MODEL_TEAM_RETENTION_DAYS,
    }),
  };
}

function createFearGreedTask(params: CreatePurgeTaskParams): CronTask {
  const { environment, database, logger } = params;
  return {
    name: TASK_NAME.SYNC_FEAR_GREED,
    run: createSyncFearGreedTask({
      repository: createSentimentRepository(database),
      client: createFearGreedClient({ baseUrl: environment.FEAR_GREED_API_URL }),
      logger,
      refreshDays: environment.FEAR_GREED_REFRESH_DAYS,
      now: () => Date.now(),
    }),
  };
}

function createAccountTasks(params: CreatePurgeTaskParams): readonly CronTask[] {
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

export function createProductionTasks(params: CreatePurgeTaskParams): readonly CronTask[] {
  const { environment, logger } = params;
  const serverClock = createServerClock({
    baseUrl: environment.BINANCE_BASE_URL,
    onWarning: (warning) => logger.warn(BACKFILL_LOG.SERVER_CLOCK_UNAVAILABLE, warning),
  });
  const tasks: readonly CronTask[] = [
    ...createAccountTasks(params),
    createBackfillTask(params, serverClock),
    createBackfillDisplayTask(params, serverClock),
    createPurgeDisplayTask(params),
    createFearGreedTask(params),
    createExpireModelTeamReportsCronTask(params),
  ];
  return selectCronTasks({ tasks, names: environment.CRON_TASKS });
}
