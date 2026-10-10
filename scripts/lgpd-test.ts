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
import { createCleanupStack, runCleanupReporting } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { assertCondition } from './identity-test/identity-test.error.js';
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
import { seedPersistence } from './lgpd-test/seed-persistence.js';
import { setUpOwners } from './lgpd-test/setup-owners.js';

async function runChecks(context: LgpdContext): Promise<void> {
  await waitForRealm(context.identity.environment);
  await checkDiscovery(context.identity);
  const telegram = startFakeTelegramServer(context.api.environment.TELEGRAM_API_BASE_URL);
  try {
    const owners = await setUpOwners(context);
    await seedPersistence(context, owners);
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
  let cleanupFailures: readonly string[];
  try {
    const temporary = await createTemporaryDatabase(adminUrl, TEMPORARY_DATABASE_PREFIX);
    identity.cleanup.register('apagar o banco temporário', () =>
      dropTemporaryDatabase(adminUrl, temporary.databaseName),
    );
    identity.cleanup.register('apagar convidados do Keycloak', () =>
      deleteKeycloakUsersWithPrefix(identity.environment, INVITEE_PREFIX),
    );
    await applyMigrations({ databaseUrl: temporary.url, migrationsFolder: MIGRATIONS_FOLDER });
    Bun.env['DATABASE_URL'] = temporary.url;
    const api = startApi();
    identity.cleanup.register('parar a API', () => api.stop());
    const sql = new Bun.SQL(temporary.url);
    identity.cleanup.register('fechar a conexão de teste', () => sql.close());
    await runChecks({ identity, api, sql, databaseUrl: temporary.url });
  } finally {
    cleanupFailures = await runCleanupReporting(identity.cleanup);
  }
  assertCondition(cleanupFailures.length === 0, `limpeza falhou: ${cleanupFailures.join('; ')}`);
  console.log('lgpd-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`lgpd-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
