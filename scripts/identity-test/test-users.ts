// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CleanupStack } from './cleanup-stack.js';
import type { IdentityEnvironment } from './identity-environment.js';
import { buildAdminUrl, fetchMasterAdminToken } from './keycloak-client.js';
import { parseJsonRecord, readString, sendRequest, type JsonRecord } from './http-client.js';
import { assertCondition } from './identity-test.error.js';

export const TEST_USER_PASSWORD = 'Identity-Test-Pass-2026!';
export const TEST_OTP_SECRET = 'identity-test-otp-secret';
export const TEST_USER_PREFIX = 'identity-test-';

export type TestUser = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
};

export type CreateTestUserParams = {
  readonly environment: IdentityEnvironment;
  readonly cleanup: CleanupStack;
  readonly kind: 'user' | 'admin-with-otp' | 'admin-without-otp';
};

export async function deleteUserById(
  environment: IdentityEnvironment,
  userId: string,
): Promise<void> {
  const adminToken = await fetchMasterAdminToken(environment);
  await sendRequest({
    url: `${buildAdminUrl(environment)}/users/${userId}`,
    method: 'DELETE',
    token: adminToken,
  });
}

async function mapAdminRole(environment: IdentityEnvironment, userId: string): Promise<void> {
  const adminToken = await fetchMasterAdminToken(environment);
  const roleResult = await sendRequest({
    url: `${buildAdminUrl(environment)}/roles/admin`,
    token: adminToken,
  });
  const mapped = await sendRequest({
    url: `${buildAdminUrl(environment)}/users/${userId}/role-mappings/realm`,
    token: adminToken,
    json: [parseJsonRecord(roleResult)],
  });
  assertCondition(
    mapped.status === 204,
    `mapear admin com o administrador mestre: ${mapped.status}`,
  );
}

function buildCredentials(kind: CreateTestUserParams['kind']): readonly unknown[] {
  const password = { type: 'password', value: TEST_USER_PASSWORD, temporary: false };
  if (kind !== 'admin-with-otp') return [password];
  return [
    password,
    {
      type: 'otp',
      secretData: JSON.stringify({ value: TEST_OTP_SECRET }),
      credentialData: JSON.stringify({
        subType: 'totp',
        digits: 6,
        period: 30,
        algorithm: 'HmacSHA1',
      }),
    },
  ];
}

export async function createTestUser(params: CreateTestUserParams): Promise<TestUser> {
  const { environment, cleanup, kind } = params;
  const adminToken = await fetchMasterAdminToken(environment);
  const username = `${TEST_USER_PREFIX}${kind}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `${username}@example.test`;
  const created = await sendRequest({
    url: `${buildAdminUrl(environment)}/users`,
    token: adminToken,
    json: {
      username,
      email,
      firstName: 'Identity',
      lastName: 'Test',
      enabled: true,
      emailVerified: true,
      requiredActions: kind === 'admin-without-otp' ? ['CONFIGURE_TOTP'] : [],
      credentials: buildCredentials(kind),
    },
  });
  assertCondition(created.status === 201, `criar ${username}: ${created.status} ${created.text}`);
  const lookup = await sendRequest({
    url: `${buildAdminUrl(environment)}/users?username=${username}&exact=true`,
    token: adminToken,
  });
  const found: unknown = JSON.parse(lookup.text);
  const first: unknown = Array.isArray(found) ? found[0] : undefined;
  assertCondition(typeof first === 'object' && first !== null, `${username} não encontrado`);
  const userId = readString(first as JsonRecord, 'id');
  cleanup.register(`apagar ${username}`, () => deleteUserById(environment, userId));
  if (kind !== 'user') await mapAdminRole(environment, userId);
  return { id: userId, username, email };
}
