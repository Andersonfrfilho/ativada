// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import { buildAdminUrl, fetchMasterAdminToken, requestTokenGrant } from './keycloak-client.js';
import {
  parseJsonRecord,
  readString,
  readText,
  sendRequest,
  type JsonRecord,
} from './http-client.js';
import { assertCondition } from './identity-test.error.js';
import { createTestUser, TEST_USER_PASSWORD, TEST_USER_PREFIX } from './test-users.js';

export type RefreshReuseMeasurement = {
  readonly firstRefreshStatus: number;
  readonly reuseStatus: number;
  readonly reuseError: string;
  readonly sessionsBeforeReuse: number;
  readonly sessionsAfterReuse: number;
  readonly newestRefreshStatusAfterReuse: number;
  readonly newestRefreshError: string;
  readonly sessionsAfterNewestAttempt: number;
};

async function countUserSessions(context: IdentityContext, userId: string): Promise<number> {
  const adminToken = await fetchMasterAdminToken(context.environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/users/${userId}/sessions`,
    token: adminToken,
  });
  const sessions: unknown = JSON.parse(result.text);
  return Array.isArray(sessions) ? sessions.length : -1;
}

async function createTemporaryDirectGrantClient(context: IdentityContext): Promise<string> {
  const clientId = `${TEST_USER_PREFIX}direct-${crypto.randomUUID().slice(0, 8)}`;
  const adminToken = await fetchMasterAdminToken(context.environment);
  const created = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/clients`,
    token: adminToken,
    json: {
      clientId,
      publicClient: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      fullScopeAllowed: false,
    },
  });
  assertCondition(
    created.status === 201,
    `criar cliente temporário: ${created.status} ${created.text}`,
  );
  const internalId = created.headers.get('location')?.split('/').at(-1) ?? '';
  context.cleanup.register(`apagar cliente ${clientId}`, async () => {
    const token = await fetchMasterAdminToken(context.environment);
    await sendRequest({
      url: `${buildAdminUrl(context.environment)}/clients/${internalId}`,
      method: 'DELETE',
      token,
    });
  });
  return clientId;
}

async function refreshWith(
  context: IdentityContext,
  clientId: string,
  refreshToken: string,
): Promise<{ readonly status: number; readonly body: JsonRecord }> {
  const result = await requestTokenGrant(context.environment, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });
  return { status: result.status, body: parseJsonRecord(result) };
}

export async function measureRefreshReuse(
  context: IdentityContext,
): Promise<RefreshReuseMeasurement> {
  const clientId = await createTemporaryDirectGrantClient(context);
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'user',
  });
  const login = await requestTokenGrant(context.environment, {
    grant_type: 'password',
    client_id: clientId,
    username: user.username,
    password: TEST_USER_PASSWORD,
    scope: 'openid',
  });
  assertCondition(
    login.status === 200,
    `direct grant do cliente temporário: ${login.status} ${login.text}`,
  );
  const originalRefresh = readString(parseJsonRecord(login), 'refresh_token');

  const first = await refreshWith(context, clientId, originalRefresh);
  assertCondition(first.status === 200, `primeiro refresh: ${first.status}`);
  const newestRefresh = readString(first.body, 'refresh_token');
  assertCondition(newestRefresh !== originalRefresh, 'o refresh não rotacionou');

  const sessionsBeforeReuse = await countUserSessions(context, user.id);
  const reuse = await refreshWith(context, clientId, originalRefresh);
  const sessionsAfterReuse = await countUserSessions(context, user.id);
  const newest = await refreshWith(context, clientId, newestRefresh);

  const measurement: RefreshReuseMeasurement = {
    firstRefreshStatus: first.status,
    reuseStatus: reuse.status,
    reuseError: readText(reuse.body, 'error_description'),
    sessionsBeforeReuse,
    sessionsAfterReuse,
    newestRefreshStatusAfterReuse: newest.status,
    newestRefreshError: readText(newest.body, 'error_description'),
    sessionsAfterNewestAttempt: await countUserSessions(context, user.id),
  };
  assertCondition(
    reuse.status === 400,
    `reuso do refresh antigo deveria ser recusado, deu ${reuse.status}`,
  );
  reportStep('reuso de refresh', JSON.stringify(measurement));
  return measurement;
}
