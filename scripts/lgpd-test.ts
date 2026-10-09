// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { INVITEE_PREFIX } from './admin-test/admin-test.constant.js';
import { startFakeTelegramServer } from './admin-test/check-telegram.js';
import { deleteKeycloakUsersWithPrefix } from './admin-test/keycloak-reads.js';
import { checkDiscovery, waitForRealm } from './identity-test/check-discovery.js';
import { createCleanupStack } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { assertCondition, IdentityTestError } from './identity-test/identity-test.error.js';
import { startApi } from './session-test/start-api.js';
import { checkDeletionStep1 } from './lgpd-test/check-delete.js';
import { checkExports } from './lgpd-test/check-export.js';
import { checkLogsAreClean } from './lgpd-test/check-logs.js';
import {
  checkAuditPseudonymized,
  checkFirstCronRun,
  checkLoginRefused,
  checkRerunAndRemoval,
  takeBaseline,
} from './lgpd-test/check-purge.js';
import { TEMPORARY_DATABASE_PREFIX } from './lgpd-test/lgpd-test.constant.js';
import type { LgpdContext } from './lgpd-test/lgpd-test-context.js';
import { setUpOwners } from './lgpd-test/setup-owners.js';

async function runChecks(context: LgpdContext): Promise<void> {
  await waitForRealm(context.identity.environment);
  await checkDiscovery(context.identity);
  const telegram = startFakeTelegramServer(context.api.environment.TELEGRAM_API_BASE_URL);
  try {
    const owners = await setUpOwners(context);
    await checkExports(context, owners);
    await checkDeletionStep1(context, owners);
    const baseline = await takeBaseline(context, owners);
    const cronRun = await checkFirstCronRun(context, { owners, baseline });
    await checkAuditPseudonymized(context, baseline);
    await checkLoginRefused(context, owners.ownerA);
    await checkRerunAndRemoval(context, { owners, baseline });
    checkLogsAreClean(context, { owners, cronOutput: cronRun.output });
  } finally {
    await telegram.stop();
  }
}

async function main(): Promise<void> {
  const identity: IdentityContext = {
    environment: readIdentityEnvironment(),
    cleanup: createCleanupStack(),
  };
  const adminUrl = readDatabaseUrl();
  const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
  await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
  Bun.env['DATABASE_URL'] = temporary.url;
  const api = startApi();
  const sql = new Bun.SQL(temporary.url);
  let failure: Error | undefined;
  try {
    await runChecks({ identity, api, sql, databaseUrl: temporary.url });
  } catch (error: unknown) {
    failure = error instanceof Error ? error : new IdentityTestError(String(error));
  }
  await api.stop();
  await sql.close();
  await dropTemporaryDatabase(adminUrl, temporary.databaseName);
  const cleanupFailures = await identity.cleanup.runAll();
  await deleteKeycloakUsersWithPrefix(identity.environment, INVITEE_PREFIX);
  if (failure !== undefined) throw failure;
  assertCondition(cleanupFailures.length === 0, `limpeza falhou: ${cleanupFailures.join('; ')}`);
  console.log('lgpd-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`lgpd-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
