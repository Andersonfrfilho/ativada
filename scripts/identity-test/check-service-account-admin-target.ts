// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import {
  buildAdminUrl,
  fetchMasterAdminToken,
  fetchServiceAccountToken,
} from './keycloak-client.js';
import { isJsonRecord, sendRequest } from './http-client.js';
import { assertCondition } from './identity-test.error.js';
import {
  ADMINS_GROUP_NAME,
  createTestUser,
  deleteUserById,
  TEST_USER_PREFIX,
  type TestUser,
} from './test-users.js';

const TAKEOVER_PASSWORD = 'Takeover-Pass-2026-xyz!';

type TakeoverAttempt = {
  readonly description: string;
  readonly status: number;
};

async function findOtpCredentialId(context: IdentityContext, userId: string): Promise<string> {
  const adminToken = await fetchMasterAdminToken(context.environment);
  const result = await sendRequest({
    url: `${buildAdminUrl(context.environment)}/users/${userId}/credentials`,
    token: adminToken,
  });
  const credentials = JSON.parse(result.text) as unknown;
  const otp = Array.isArray(credentials)
    ? (credentials as readonly unknown[]).find(
        (entry: unknown) => isJsonRecord(entry) && entry['type'] === 'otp',
      )
    : undefined;
  return isJsonRecord(otp) && typeof otp['id'] === 'string' ? otp['id'] : '';
}

async function attemptPromotion(
  context: IdentityContext,
  serviceToken: string,
): Promise<readonly TakeoverAttempt[]> {
  const adminUrl = buildAdminUrl(context.environment);
  const plain = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'user',
  });
  const masterToken = await fetchMasterAdminToken(context.environment);
  const groups = await sendRequest({
    url: `${adminUrl}/groups?search=${ADMINS_GROUP_NAME}&exact=true`,
    token: masterToken,
  });
  const found: unknown = JSON.parse(groups.text);
  const first: unknown = Array.isArray(found) ? found[0] : undefined;
  const groupId = isJsonRecord(first) && typeof first['id'] === 'string' ? first['id'] : '';
  const join = await sendRequest({
    url: `${adminUrl}/users/${plain.id}/groups/${groupId}`,
    method: 'PUT',
    token: serviceToken,
  });
  const username = `${TEST_USER_PREFIX}promoted-${crypto.randomUUID().slice(0, 8)}`;
  const created = await sendRequest({
    url: `${adminUrl}/users`,
    token: serviceToken,
    json: { username, email: `${username}@example.test`, enabled: true, groups: ['/admins'] },
  });
  const createdId = created.headers.get('location')?.split('/').at(-1) ?? '';
  if (createdId.length > 0) {
    context.cleanup.register(`apagar ${username}`, () =>
      deleteUserById(context.environment, createdId),
    );
  }
  return [
    { description: 'PUT /users/{comum}/groups/{admins}', status: join.status },
    { description: 'POST /users com groups [/admins]', status: created.status },
  ];
}

type AdminAttackRequest = {
  readonly description: string;
  readonly path: string;
  readonly method: string;
  readonly json?: unknown;
};

function buildAdminAttacks(admin: TestUser, otpId: string): readonly AdminAttackRequest[] {
  return [
    {
      description: 'PUT /users/{admin} alterando o e-mail',
      path: '',
      method: 'PUT',
      json: { email: `takeover-${admin.email}` },
    },
    {
      description: 'PUT /users/{admin}/reset-password',
      path: '/reset-password',
      method: 'PUT',
      json: { type: 'password', value: TAKEOVER_PASSWORD, temporary: false },
    },
    {
      description: 'DELETE /users/{admin}/credentials/{totp}',
      path: `/credentials/${otpId}`,
      method: 'DELETE',
    },
    {
      description: 'PUT /users/{admin} desabilitando',
      path: '',
      method: 'PUT',
      json: { enabled: false },
    },
    { description: 'DELETE /users/{admin}', path: '', method: 'DELETE' },
  ];
}

export async function attemptAdminTakeover(
  context: IdentityContext,
): Promise<readonly TakeoverAttempt[]> {
  const admin = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'admin-with-otp',
  });
  const serviceToken = await fetchServiceAccountToken(context.environment);
  const userUrl = `${buildAdminUrl(context.environment)}/users/${admin.id}`;
  const attacks = buildAdminAttacks(admin, await findOtpCredentialId(context, admin.id));
  const attempts: TakeoverAttempt[] = [];
  for (const attack of attacks) {
    const answer = await sendRequest({
      url: `${userUrl}${attack.path}`,
      method: attack.method,
      token: serviceToken,
      ...(attack.json === undefined ? {} : { json: attack.json }),
    });
    attempts.push({ description: attack.description, status: answer.status });
  }
  return [...attempts, ...(await attemptPromotion(context, serviceToken))];
}

export async function checkServiceAccountCannotTakeOverAdmin(
  context: IdentityContext,
): Promise<void> {
  const attempts = await attemptAdminTakeover(context);
  for (const attempt of attempts) {
    console.log(`identity-test: MEDICAO M5 ${attempt.description} -> HTTP ${attempt.status}`);
  }
  const succeeded = attempts.filter((attempt) => attempt.status < 400);
  assertCondition(
    succeeded.length === 0,
    `a service account tomou uma conta admin: ${succeeded.map((attempt) => attempt.description).join('; ')}`,
  );
  reportStep(
    'service account x admin',
    'e-mail, senha, TOTP, desabilitar, apagar e entrada no grupo admins recusados (403)',
  );
}
