// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase, type DatabaseHandle } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkPendingQueue, checkPurge, checkRemoveAndRetention } from './account-purge-checks.js';
import { checkAdminRepositories } from './admin-checks.js';
import { checkAlerts } from './alert-checks.js';
import { checkAuditRetention, checkBlockedAccounts } from './cron-repository-checks.js';
import {
  checkExport,
  checkMarkDeleted,
  seedLifecycleOwners,
  type LifecycleCheckContext,
} from './account-lifecycle-checks.js';
import { checkCandleRepository } from './candle-checks.js';
import { checkMissingOpenTimes } from './candle-gap-checks.js';
import { checkSentimentRepository } from './sentiment-checks.js';
import { checkSentimentObservations } from './sentiment-observation-checks.js';
import { checkPersistenceIsolation } from './persistence-isolation-checks.js';
import {
  checkPersistenceExport,
  checkPersistencePurge,
  seedPersistenceOwners,
} from './persistence-lgpd-checks.js';
import { checkRunEvents } from './run-event-checks.js';
import { checkRunDataWait } from './run-data-wait-checks.js';
import { checkReconnection } from './reconnect-checks.js';
import { checkRunStall } from './run-stall-checks.js';
import { checkRunStallSweep } from './run-stall-sweep-checks.js';
import { checkWorkerHeartbeats } from './worker-heartbeat-checks.js';
import { checkRunLog } from './run-log-checks.js';
import { checkRunDeletion } from './run-delete-checks.js';
import { checkRunRepository } from './run-checks.js';
import {
  checkBatchIsAtomic,
  checkLargeBatch,
  checkOversizedOrderBatch,
} from './run-result-batch-checks.js';
import {
  checkBatchCommitAndRollback,
  checkBatchGuards,
  checkCancelWaitsForTheBatch,
  checkCompletionSetsFullProgress,
  checkRunOwnerResolution,
  checkWindowBatchIsAtomic,
} from './run-batch-checks.js';
import { checkResultPagination } from './run-result-page-checks.js';
import {
  checkFillMarkers,
  checkPriceColumns,
  checkTradeFilters,
  checkTradeTotals,
} from './run-chart-checks.js';
import { checkChartIsolation } from './run-chart-isolation-checks.js';
import { checkLiveStatusReads } from './run-live-status-checks.js';
import { checkProjectionReads } from './run-projection-checks.js';
import { checkSurvivalPoints } from './run-survival-checks.js';
import {
  checkCommandsAndForeignKey,
  checkOrderMonotonicity,
  checkPositionMonotonicity,
  checkWalkForwardWindowRules,
  checkWindowNamespace,
} from './run-result-rule-checks.js';
import { checkExampleStrategySeeding } from './example-strategy-checks.js';
import { checkGoals } from './goal-checks.js';
import { checkPriceAlerts } from './price-alert-checks.js';
import { checkUserAssets } from './user-asset-checks.js';
import { checkGoalRuns } from './goal-run-checks.js';
import { checkLiveRuns } from './live-run-checks.js';
import { checkRunQueueClaims } from './run-queue-checks.js';
import { checkRunQueueLifecycle } from './run-queue-lifecycle-checks.js';
import { checkRunQueueReading } from './run-queue-reading-checks.js';
import { checkStrategyRepository } from './strategy-checks.js';
import { checkStorageQuotas } from './storage-quota-checks.js';
import { checkStrategyPages } from './strategy-page-checks.js';
import { checkProfileRepository } from './profile-checks.js';
import { checkTelegramLink, checkTelegramRaces } from './telegram-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

const TEMPORARY_DATABASE_PREFIX = 'ativada_database_';
const CONCURRENT_CALLS = 20;
const CONCURRENT_SUBJECT = 'subject-concurrent';
const DELETED_SUBJECT = 'subject-deleted';
const BLOCKED_SUBJECT = 'subject-blocked';

type CountRow = { readonly total: number };

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function reportCheck(message: string): void {
  process.stdout.write(`database-test: ${message}\n`);
}

async function countUsersBySubject(client: Bun.SQL, subject: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM users WHERE keycloak_sub = ${subject}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function checkConcurrentResolution(handle: DatabaseHandle, client: Bun.SQL): Promise<void> {
  const resolutions = await Promise.all(
    Array.from({ length: CONCURRENT_CALLS }, () =>
      resolveUserBySubject(handle, CONCURRENT_SUBJECT),
    ),
  );
  const userIds = new Set<string>();
  for (const resolution of resolutions) {
    assertCondition(resolution.status === USER_RESOLUTION_STATUS.ACTIVE, 'resolução não ativa');
    if (resolution.status === USER_RESOLUTION_STATUS.ACTIVE) userIds.add(resolution.userId);
  }
  const total = await countUsersBySubject(client, CONCURRENT_SUBJECT);
  assertCondition(total === 1, `esperado count(*) = 1, obtido ${total}`);
  assertCondition(userIds.size === 1, `esperado um só userId, obtidos ${userIds.size}`);
  reportCheck(`${CONCURRENT_CALLS} chamadas simultâneas -> count(*) = 1 e o mesmo userId`);
}

async function checkDeletedAccount(handle: DatabaseHandle, client: Bun.SQL): Promise<void> {
  await resolveUserBySubject(handle, DELETED_SUBJECT);
  await client`UPDATE users SET deleted_at = now() WHERE keycloak_sub = ${DELETED_SUBJECT}`;
  const resolution = await resolveUserBySubject(handle, DELETED_SUBJECT);
  const total = await countUsersBySubject(client, DELETED_SUBJECT);
  assertCondition(resolution.status === USER_RESOLUTION_STATUS.DELETED, 'esperado estado deleted');
  assertCondition(total === 1, `conta apagada foi recriada: count(*) = ${total}`);
  reportCheck('deleted_at preenchido -> estado deleted, sem recriar');
}

async function checkBlockedAccount(handle: DatabaseHandle, client: Bun.SQL): Promise<void> {
  await resolveUserBySubject(handle, BLOCKED_SUBJECT);
  await client`UPDATE users SET blocked_at = now() WHERE keycloak_sub = ${BLOCKED_SUBJECT}`;
  const resolution = await resolveUserBySubject(handle, BLOCKED_SUBJECT);
  assertCondition(resolution.status === USER_RESOLUTION_STATUS.BLOCKED, 'esperado estado blocked');
  reportCheck('blocked_at preenchido -> estado blocked');
}

async function checkPersistence(context: LifecycleCheckContext): Promise<void> {
  await checkStrategyRepository(context);
  await checkStrategyPages(context);
  await checkExampleStrategySeeding(context);
  await checkRunRepository(context);
  await checkRunDeletion(context);
  const batch = await checkLargeBatch(context);
  await checkResultPagination(context, batch);
  await checkSurvivalPoints(context);
  await checkPriceColumns(context);
  await checkFillMarkers(context);
  await checkTradeFilters(context);
  await checkTradeTotals(context);
  await checkChartIsolation(context);
  await checkLiveStatusReads(context);
  await checkProjectionReads(context);
  await checkOversizedOrderBatch(context);
  await checkBatchIsAtomic(context);
  await checkOrderMonotonicity(context);
  await checkPositionMonotonicity(context);
  await checkWindowNamespace(context);
  await checkWalkForwardWindowRules(context);
  await checkCommandsAndForeignKey(context);
  await checkPersistenceIsolation(context);
  await checkRunOwnerResolution(context);
  await checkBatchCommitAndRollback(context);
  await checkBatchGuards(context);
  await checkWindowBatchIsAtomic(context);
  await checkCancelWaitsForTheBatch(context);
  await checkCompletionSetsFullProgress(context);
  await checkRunQueueClaims(context);
  await checkRunQueueLifecycle(context);
  await checkRunQueueReading(context);
  await checkLiveRuns(context);
  await checkAlerts(context);
  await checkGoals(context);
  await checkPriceAlerts(context);
  await checkStorageQuotas(context);
  await checkUserAssets(context);
  await checkGoalRuns(context);
  await checkRunLog(context);
}

async function runChecks(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    await checkConcurrentResolution(handle, client);
    await checkDeletedAccount(handle, client);
    await checkBlockedAccount(handle, client);
    await checkProfileRepository({ handle, assertCondition, reportCheck });
    await checkTelegramLink({ handle, client, assertCondition, reportCheck });
    await checkTelegramRaces({ handle, client, assertCondition, reportCheck });
    await checkAdminRepositories({ handle, client, assertCondition, reportCheck });
    const lifecycle = { handle, client, assertCondition, reportCheck };
    const owners = await seedLifecycleOwners(lifecycle);
    await seedPersistenceOwners(lifecycle, owners);
    await checkExport(lifecycle, owners);
    await checkPersistenceExport(lifecycle, owners);
    await checkMarkDeleted(lifecycle, owners);
    await checkPendingQueue(lifecycle);
    await checkPurge(lifecycle, owners);
    await checkPersistencePurge(lifecycle, owners);
    await checkRemoveAndRetention(lifecycle, owners);
    await checkBlockedAccounts(lifecycle);
    await checkAuditRetention(lifecycle);
    await checkCandleRepository(lifecycle);
    await checkMissingOpenTimes(lifecycle);
    await checkSentimentRepository(lifecycle);
    await checkSentimentObservations(lifecycle);
    await checkPersistence(lifecycle);
    await checkRunEvents(lifecycle, databaseUrl);
    await checkRunDataWait(lifecycle, databaseUrl);
    await checkWorkerHeartbeats(lifecycle);
    await checkRunStall(lifecycle);
    await checkRunStallSweep(lifecycle, databaseUrl);
    await checkReconnection(lifecycle, databaseUrl);
  } finally {
    await client.close();
    await closeDatabase(handle);
  }
}

async function main(): Promise<void> {
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  try {
    await runChecks(temporary.url);
  } finally {
    await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  }
  reportCheck('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `database-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n${error instanceof Error && error.cause instanceof Error ? error.cause.message : ''}\n`,
  );
  process.exitCode = 1;
}
