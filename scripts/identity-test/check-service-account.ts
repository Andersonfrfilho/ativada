// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import {
  buildAdminUrl,
  fetchMasterAdminToken,
  fetchServiceAccountToken,
} from './keycloak-client.js';
import { buildPanelRedirectUri } from './browser-login.js';
import { parseJsonRecord, sendRequest } from './http-client.js';
import { assertCondition } from './identity-test.error.js';
import { waitForMailTo } from './mailpit-client.js';
import { deleteUserById, TEST_USER_PREFIX } from './test-users.js';

const ACTION_LIFESPAN_SECONDS = 86_400;

async function readRealmRoleNames(
  context: IdentityContext,
  userId: string,
): Promise<readonly string[]> {
  const adminToken = await fetchMasterAdminToken(context.environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/users/${userId}/role-mappings/realm`,
    token: adminToken,
  });
  const roles: unknown = JSON.parse(result.text);
  return Array.isArray(roles) ? roles.map((role: unknown) => String(parseRoleName(role))) : [];
}

function parseRoleName(role: unknown): unknown {
  return typeof role === 'object' && role !== null
    ? (role as Record<string, unknown>)['name']
    : undefined;
}

async function createAsServiceAccount(
  context: IdentityContext,
  serviceToken: string,
  extra: Readonly<Record<string, unknown>>,
): Promise<{ readonly status: number; readonly id: string; readonly email: string }> {
  const username = `${TEST_USER_PREFIX}service-${crypto.randomUUID().slice(0, 8)}`;
  const email = `${username}@example.test`;
  const created = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/users`,
    token: serviceToken,
    json: {
      username,
      email,
      firstName: 'Identity',
      lastName: 'Test',
      enabled: true,
      emailVerified: true,
      ...extra,
    },
  });
  const id = created.headers.get('location')?.split('/').at(-1) ?? '';
  if (id.length > 0) {
    context.cleanup.register(`apagar ${username}`, () => deleteUserById(context.environment, id));
  }
  return { status: created.status, id, email };
}

export async function checkServiceAccount(context: IdentityContext): Promise<void> {
  const { environment } = context;
  const serviceToken = await fetchServiceAccountToken(environment);
  const adminUrl = buildAdminUrl(environment);

  const created = await createAsServiceAccount(context, serviceToken, {});
  assertCondition(created.status === 201, `service account criar usuário: ${created.status}`);

  const adminToken = await fetchMasterAdminToken(environment);
  const adminRole = parseJsonRecord(
    await sendRequest({ url: `${adminUrl}/roles/admin`, token: adminToken }),
  );
  const mapping = await sendRequest({
    url: `${adminUrl}/users/${created.id}/role-mappings/realm`,
    token: serviceToken,
    json: [adminRole],
  });
  console.log(
    `identity-test: service account mapeando o papel admin -> HTTP ${mapping.status} ${mapping.text}`,
  );
  assertCondition(mapping.status === 403, `mapear admin deveria dar 403, deu ${mapping.status}`);
  assertCondition(
    !(await readRealmRoleNames(context, created.id)).includes('admin'),
    'o usuário ficou com admin',
  );

  const escalation = await createAsServiceAccount(context, serviceToken, { realmRoles: ['admin'] });
  const escalatedRoles =
    escalation.status === 201 ? await readRealmRoleNames(context, escalation.id) : [];
  console.log(
    `identity-test: service account criando usuário com realmRoles [admin] -> HTTP ${escalation.status}, papéis resultantes [${escalatedRoles.join(',')}]`,
  );
  assertCondition(
    !escalatedRoles.includes('admin'),
    'criar usuário com realmRoles admin concedeu o papel',
  );

  for (const [description, path, method] of [
    ['ler o realm', '', 'GET'],
    ['listar clientes', '/clients', 'GET'],
    ['alterar o realm', '', 'PUT'],
  ] as const) {
    const denied = await sendRequest({
      url: `${adminUrl}${path}`,
      token: serviceToken,
      method,
      ...(method === 'PUT' ? { json: {} } : {}),
    });
    assertCondition(denied.status === 403, `${description} deveria dar 403, deu ${denied.status}`);
  }

  const invitation = await sendRequest({
    url: `${adminUrl}/users/${created.id}/execute-actions-email?lifespan=${ACTION_LIFESPAN_SECONDS}&client_id=crypto-panel&redirect_uri=${encodeURIComponent(buildPanelRedirectUri(environment))}`,
    method: 'PUT',
    token: serviceToken,
    json: ['UPDATE_PASSWORD'],
  });
  assertCondition(
    invitation.status === 204,
    `execute-actions-email: ${invitation.status} ${invitation.text}`,
  );
  const mail = await waitForMailTo(environment, created.email);

  const disabled = await sendRequest({
    url: `${adminUrl}/users/${created.id}`,
    method: 'PUT',
    token: serviceToken,
    json: { enabled: false },
  });
  assertCondition(disabled.status === 204, `desabilitar: ${disabled.status}`);
  const removed = await sendRequest({
    url: `${adminUrl}/users/${created.id}`,
    method: 'DELETE',
    token: serviceToken,
  });
  assertCondition(removed.status === 204, `apagar: ${removed.status}`);
  reportStep(
    'service account',
    `criar, enviar e-mail de ação, desabilitar e apagar funcionam; mapear admin -> 403; e-mail "${mail.subject}" chegou ao Mailpit`,
  );
}
