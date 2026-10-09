// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createPkcePair, startLogin, submitLoginForm } from './browser-login.js';
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import {
  buildAdminUrl,
  fetchMasterAdminToken,
  fetchServiceAccountToken,
} from './keycloak-client.js';
import { isJsonRecord, sendRequest } from './http-client.js';
import { assertCondition } from './identity-test.error.js';
import { createTestUser, deleteUserById, TEST_USER_PREFIX } from './test-users.js';

const WRONG_PASSWORD = 'Wrong-Password-2026-xyz!';

async function readJsonList(
  context: IdentityContext,
  path: string,
  token: string,
): Promise<{ readonly status: number; readonly items: readonly unknown[] }> {
  const result = await sendRequest({ url: `${buildAdminUrl(context.environment)}${path}`, token });
  const parsed: unknown = result.status === 200 ? JSON.parse(result.text) : [];
  return { status: result.status, items: Array.isArray(parsed) ? parsed : [] };
}

async function failLoginOnce(context: IdentityContext, username: string): Promise<void> {
  const first = await startLogin({ environment: context.environment, pkce: createPkcePair() });
  assertCondition(first.kind === 'page', 'o login não abriu a página de senha');
  await submitLoginForm(first, { username, password: WRONG_PASSWORD, credentialId: '' });
}

async function checkLoginErrorEvent(context: IdentityContext): Promise<void> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'user',
  });
  await failLoginOnce(context, user.username);
  const masterToken = await fetchMasterAdminToken(context.environment);
  const events = await readJsonList(
    context,
    `/events?type=LOGIN_ERROR&user=${user.id}`,
    masterToken,
  );
  assertCondition(events.items.length >= 1, 'senha errada não gerou LOGIN_ERROR');
  const serviceRead = await readJsonList(
    context,
    `/events?type=LOGIN_ERROR&user=${user.id}`,
    await fetchServiceAccountToken(context.environment),
  );
  console.log(
    `identity-test: MEDICAO eventos LOGIN_ERROR lidos pela conta de admin do realm -> ${events.items.length}; pela service account -> HTTP ${serviceRead.status}`,
  );
  assertCondition(serviceRead.status === 403, 'a service account não deveria ler eventos');
}

async function checkAdminEvent(context: IdentityContext): Promise<void> {
  const serviceToken = await fetchServiceAccountToken(context.environment);
  const username = `${TEST_USER_PREFIX}event-${crypto.randomUUID().slice(0, 8)}`;
  const created = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/users`,
    token: serviceToken,
    json: { username, email: `${username}@example.test`, enabled: true },
  });
  const userId = created.headers.get('location')?.split('/').at(-1) ?? '';
  assertCondition(userId.length > 0, `criar usuário para o evento: ${created.status}`);
  context.cleanup.register(`apagar ${username}`, () => deleteUserById(context.environment, userId));
  const masterToken = await fetchMasterAdminToken(context.environment);
  const events = await readJsonList(
    context,
    `/admin-events?operationTypes=CREATE&resourceTypes=USER&resourcePath=users/${userId}`,
    masterToken,
  );
  const [event] = events.items;
  assertCondition(isJsonRecord(event), 'criar usuário não gerou evento administrativo');
  assertCondition(event['representation'] === undefined, 'o evento administrativo guardou o corpo');
  console.log(
    `identity-test: MEDICAO evento administrativo CREATE USER -> ${events.items.length}, com corpo: ${String(event['representation'] !== undefined)}`,
  );
}

export async function checkKeycloakEvents(context: IdentityContext): Promise<void> {
  await checkLoginErrorEvent(context);
  await checkAdminEvent(context);
  reportStep(
    'eventos',
    'senha errada gera LOGIN_ERROR e criar usuário gera evento administrativo sem corpo',
  );
}
