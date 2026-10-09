// Copyright (c) 2026 Ada Technology. All rights reserved.
import { checkAccountConsoleStepUp } from './identity-test/check-account-console.js';
import { checkKeycloakEvents } from './identity-test/check-events.js';
import { checkClientFlows } from './identity-test/check-clients.js';
import { checkDiscovery, waitForRealm } from './identity-test/check-discovery.js';
import {
  checkAdminStepUp,
  checkAdminWithoutOtp,
  checkPlainUserLogin,
} from './identity-test/check-login.js';
import { measureRefreshReuse } from './identity-test/check-refresh-reuse.js';
import { checkServiceAccountCannotTakeOverAdmin } from './identity-test/check-service-account-admin-target.js';
import { checkServiceAccount } from './identity-test/check-service-account.js';
import { createCleanupStack } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { reportStep } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { buildAdminUrl, fetchMasterAdminToken } from './identity-test/keycloak-client.js';
import { sendRequest } from './identity-test/http-client.js';
import { assertCondition, IdentityTestError } from './identity-test/identity-test.error.js';
import { TEST_USER_PREFIX } from './identity-test/test-users.js';

async function assertNoTestResidue(context: IdentityContext): Promise<void> {
  const adminToken = await fetchMasterAdminToken(context.environment);
  const adminUrl = buildAdminUrl(context.environment);
  const users = await sendRequest({
    url: `${adminUrl}/users?search=${TEST_USER_PREFIX}&max=100`,
    token: adminToken,
  });
  const clients = await sendRequest({
    url: `${adminUrl}/clients?search=true&clientId=${TEST_USER_PREFIX}`,
    token: adminToken,
  });
  const leftovers = [users, clients].map(
    (result) => (JSON.parse(result.text) as readonly unknown[]).length,
  );
  assertCondition(
    leftovers[0] === 0 && leftovers[1] === 0,
    `sobraram ${leftovers[0]} usuários e ${leftovers[1]} clientes de teste`,
  );
  reportStep('limpeza', 'nenhum usuário nem cliente de teste ficou no realm');
}

async function runChecks(context: IdentityContext): Promise<void> {
  await waitForRealm(context.environment);
  await checkDiscovery(context);
  await checkAccountConsoleStepUp(context);
  await checkClientFlows(context);
  await checkPlainUserLogin(context);
  await checkAdminWithoutOtp(context);
  await checkAdminStepUp(context);
  await checkServiceAccount(context);
  await checkServiceAccountCannotTakeOverAdmin(context);
  await checkKeycloakEvents(context);
  await measureRefreshReuse(context);
}

async function main(): Promise<void> {
  const context: IdentityContext = {
    environment: readIdentityEnvironment(),
    cleanup: createCleanupStack(),
  };
  let failure: Error | undefined;
  try {
    await runChecks(context);
  } catch (error: unknown) {
    failure = error instanceof Error ? error : new IdentityTestError(String(error));
  }
  const cleanupFailures = await context.cleanup.runAll();
  if (failure !== undefined) throw failure;
  if (cleanupFailures.length > 0)
    throw new IdentityTestError(`limpeza falhou: ${cleanupFailures.join('; ')}`);
  await assertNoTestResidue(context);
  console.log('identity-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(
    `identity-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
