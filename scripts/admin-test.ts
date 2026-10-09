// Copyright (c) 2026 Ada Technology. All rights reserved.
import { applyMigrations } from '../packages/database/src/migrate.js';
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import {
  createTemporaryDatabase,
  dropTemporaryDatabase,
} from '../packages/database/test-support/temporary-database.js';
import { checkDiscovery, waitForRealm } from './identity-test/check-discovery.js';
import { createCleanupStack, runCleanupReporting } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { assertCondition } from './identity-test/identity-test.error.js';
import { startApi } from './session-test/start-api.js';
import { TEMPORARY_DATABASE_PREFIX, INVITEE_PREFIX } from './admin-test/admin-test.constant.js';
import type { AdminTestContext } from './admin-test/admin-test-context.js';
import { checkAccess } from './admin-test/check-access.js';
import { checkAuditTrail, checkLogsAreClean } from './admin-test/check-audit.js';
import { checkBlockAndUnblock, checkBlockRefusals } from './admin-test/check-block.js';
import { checkFirstInvitation, checkInvitationRefusals } from './admin-test/check-invitation.js';
import { checkResend, measureDirectResend } from './admin-test/check-resend.js';
import {
  checkTelegramLinking,
  startFakeTelegramServer,
  TEST_CHAT_ID,
} from './admin-test/check-telegram.js';
import { deleteKeycloakUsersWithPrefix } from './admin-test/keycloak-reads.js';
import { setUpActors } from './admin-test/setup-actors.js';

async function runChecks(context: AdminTestContext): Promise<void> {
  const { environment } = context.api;
  await waitForRealm(context.identity.environment);
  await checkDiscovery(context.identity);
  const telegram = startFakeTelegramServer(environment.TELEGRAM_API_BASE_URL);
  try {
    const actors = await setUpActors(context);
    await checkAccess(context, actors);
    const inviteeEmail = await checkFirstInvitation(context, actors);
    await checkInvitationRefusals(context, actors);
    await measureDirectResend(context);
    await checkResend(context, { actors, email: inviteeEmail });
    await checkBlockAndUnblock(context, actors);
    await checkBlockRefusals(context, actors);
    await checkTelegramLinking(context, { actors, telegram });
    await checkAuditTrail(context);
    checkLogsAreClean(context, {
      actors,
      secrets: [
        TEST_CHAT_ID,
        environment.TELEGRAM_WEBHOOK_SECRET ?? '',
        environment.TELEGRAM_BOT_TOKEN ?? '',
        environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
        inviteeEmail,
      ],
    });
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
    await runChecks({ identity, api, sql });
  } finally {
    cleanupFailures = await runCleanupReporting(identity.cleanup);
  }
  assertCondition(cleanupFailures.length === 0, `limpeza falhou: ${cleanupFailures.join('; ')}`);
  console.log('admin-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`admin-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
