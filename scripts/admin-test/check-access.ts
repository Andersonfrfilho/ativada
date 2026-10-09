// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildAdminUrl, fetchServiceAccountToken } from '../identity-test/keycloak-client.js';
import { sendRequest } from '../identity-test/http-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { ACCOUNTS_PATH } from './admin-test.constant.js';
import {
  reportAdminStep,
  reportMeasurement,
  type AdminTestContext,
  type TestActors,
} from './admin-test-context.js';
import { readData, readErrorCode, requestApi } from './api-request.js';

const ALLOWED_ACCOUNT_KEYS = ['blockedAt', 'createdAt', 'deletedAt', 'email', 'id'];

async function readRolesAsServiceAccount(
  context: AdminTestContext,
  keycloakId: string,
): Promise<{ readonly status: number; readonly roles: readonly string[] }> {
  const token = await fetchServiceAccountToken(context.identity.environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(context.identity.environment)}/users/${keycloakId}/role-mappings/realm/composite`,
    token,
  });
  const parsed: unknown = result.status === 200 ? JSON.parse(result.text) : [];
  const roles = Array.isArray(parsed)
    ? parsed.map((role: { name?: unknown }) => String(role.name))
    : [];
  return { status: result.status, roles };
}

async function checkRoleReading(context: AdminTestContext, actors: TestActors): Promise<void> {
  const ofAdmin = await readRolesAsServiceAccount(context, actors.admin.keycloakId);
  const ofMember = await readRolesAsServiceAccount(context, actors.member.keycloakId);
  assertCondition(
    ofAdmin.status === 200 && ofMember.status === 200,
    'a service account não lê papéis',
  );
  assertCondition(ofAdmin.roles.includes('admin'), 'papéis efetivos do admin sem admin');
  assertCondition(!ofMember.roles.includes('admin'), 'papéis efetivos do membro com admin');
  reportMeasurement(
    'service account lendo papéis efetivos (role-mappings/realm/composite)',
    `HTTP 200; admin=[${ofAdmin.roles.join(',')}] membro=[${ofMember.roles.join(',')}]`,
  );
}

async function checkAccountListing(context: AdminTestContext, actors: TestActors): Promise<void> {
  const { baseUrl } = context.api;
  const listing = await requestApi({
    baseUrl,
    path: ACCOUNTS_PATH,
    token: actors.admin.accessToken,
  });
  assertCondition(listing.status === 200, `GET /v1/admin/accounts: ${listing.status}`);
  const items = (listing.json['data'] as readonly Record<string, unknown>[]) ?? [];
  const emails = items.map((item) => item['email']);
  for (const actor of [actors.admin, actors.otherAdmin, actors.member]) {
    assertCondition(emails.includes(actor.email), 'e-mail do Keycloak ausente na listagem');
  }
  for (const item of items) {
    assertCondition(
      Object.keys(item).sort().join() === ALLOWED_ACCOUNT_KEYS.join(),
      'campos extras',
    );
  }
  const paged = await requestApi({
    baseUrl,
    path: `${ACCOUNTS_PATH}?limit=2`,
    token: actors.admin.accessToken,
  });
  const pagination = paged.json['pagination'] as { nextCursor: string | null } | undefined;
  assertCondition(typeof pagination?.nextCursor === 'string', 'cursor ausente com 3+ contas');
  reportAdminStep(
    'GET /v1/admin/accounts',
    `${items.length} contas com e-mail do Keycloak real; cursor funciona`,
  );
}

async function checkGates(context: AdminTestContext, actors: TestActors): Promise<void> {
  const { baseUrl } = context.api;
  const asMember = await requestApi({
    baseUrl,
    path: ACCOUNTS_PATH,
    token: actors.member.accessToken,
  });
  const withoutMfa = await requestApi({
    baseUrl,
    path: ACCOUNTS_PATH,
    token: actors.adminWithoutMfaToken,
  });
  const anonymous = await requestApi({ baseUrl, path: ACCOUNTS_PATH });
  assertCondition(asMember.status === 403 && readErrorCode(asMember) === 'FORBIDDEN', 'membro');
  assertCondition(
    withoutMfa.status === 403 && readErrorCode(withoutMfa) === 'MFA_REQUIRED',
    'sem MFA',
  );
  assertCondition(anonymous.status === 401, 'anônimo');
  assertCondition(Object.keys(readData(asMember)).length === 0, 'membro não recebe dado admin');
  reportAdminStep('portões', 'membro 403 FORBIDDEN; admin sem OTP 403 MFA_REQUIRED; anônimo 401');
}

export async function checkAccess(context: AdminTestContext, actors: TestActors): Promise<void> {
  await checkRoleReading(context, actors);
  await checkAccountListing(context, actors);
  await checkGates(context, actors);
}
