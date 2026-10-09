// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { closeDatabase, openDatabase, type DatabaseHandle } from '../src/database-handle.js';
import { applyMigrations } from '../src/migrate.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { checkPendingQueue, checkPurge, checkRemoveAndRetention } from './account-purge-checks.js';
import { checkAdminRepositories } from './admin-checks.js';
import { checkAuditRetention, checkBlockedAccounts } from './cron-repository-checks.js';
import { checkExport, checkMarkDeleted, seedLifecycleOwners } from './account-lifecycle-checks.js';
import { checkProfileRepository } from './profile-checks.js';
import { checkTelegramLink, checkTelegramRaces } from './telegram-checks.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

const TEMPORARY_DATABASE_PREFIX = 'crypto_database_';
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
    await checkExport(lifecycle, owners);
    await checkMarkDeleted(lifecycle, owners);
    await checkPendingQueue(lifecycle);
    await checkPurge(lifecycle, owners);
    await checkRemoveAndRetention(lifecycle, owners);
    await checkBlockedAccounts(lifecycle);
    await checkAuditRetention(lifecycle);
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
    `database-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
