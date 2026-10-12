// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccessTokenVerifier } from '../apps/api-ativada/src/authentication/access-token-verifier.js';
import { createRemoteKeyResolver } from '../apps/api-ativada/src/authentication/remote-key-resolver.js';
import { checkDiscovery, waitForRealm } from './identity-test/check-discovery.js';
import { createCleanupStack, runCleanupReporting } from './identity-test/cleanup-stack.js';
import type { IdentityContext } from './identity-test/identity-context.js';
import { readIdentityEnvironment } from './identity-test/identity-environment.js';
import { assertCondition } from './identity-test/identity-test.error.js';
import {
  checkDefenses,
  endSession,
  openSession,
  refreshTwiceInParallel,
  refreshWithRotatedCookie,
} from './session-test/check-session-flow.js';
import { obtainAuthorizationCode } from './session-test/obtain-authorization-code.js';
import { reportSessionStep, type SessionFlowContext } from './session-test/session-flow-context.js';
import { startApi, type RunningApi } from './session-test/start-api.js';

function buildFlow(identity: IdentityContext, api: RunningApi): SessionFlowContext {
  const { environment } = api;
  return {
    identity,
    api,
    origin: identity.environment.panelOrigin,
    verifyAccessToken: createAccessTokenVerifier({
      settings: {
        issuer: environment.KEYCLOAK_ISSUER,
        audience: environment.API_AUDIENCE,
        authorizedParties: environment.AUTHORIZED_PARTIES,
      },
      getKey: createRemoteKeyResolver({ jwksUrl: environment.KEYCLOAK_JWKS_URL }),
    }),
  };
}

async function runChecks(identity: IdentityContext, api: RunningApi): Promise<void> {
  const flow = buildFlow(identity, api);
  await waitForRealm(identity.environment);
  await checkDiscovery(identity);
  const originalCookie = await openSession(flow, await obtainAuthorizationCode(identity));
  const rotatedCookie = await refreshTwiceInParallel(flow, originalCookie);
  const latestCookie = await refreshWithRotatedCookie(flow, rotatedCookie);
  await endSession(flow, latestCookie);
  await checkDefenses(flow);
  const log = api.logLines.join('');
  for (const secret of [originalCookie, rotatedCookie, latestCookie]) {
    assertCondition(!log.includes(secret), 'um refresh token apareceu no log da API');
  }
  reportSessionStep('log', 'nenhum refresh token nos logs da API');
}

async function main(): Promise<void> {
  const identity: IdentityContext = {
    environment: readIdentityEnvironment(),
    cleanup: createCleanupStack(),
  };
  const api = startApi();
  identity.cleanup.register('parar a API', () => api.stop());
  let cleanupFailures: readonly string[];
  try {
    await runChecks(identity, api);
  } finally {
    cleanupFailures = await runCleanupReporting(identity.cleanup);
  }
  assertCondition(cleanupFailures.length === 0, `limpeza falhou: ${cleanupFailures.join('; ')}`);
  console.log('session-test: OK');
}

try {
  await main();
} catch (error: unknown) {
  console.error(`session-test: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
