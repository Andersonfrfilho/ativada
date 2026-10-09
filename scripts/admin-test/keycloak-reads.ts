// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from '../identity-test/identity-environment.js';
import { buildAdminUrl, fetchMasterAdminToken } from '../identity-test/keycloak-client.js';
import { isJsonRecord, sendRequest } from '../identity-test/http-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';

export type KeycloakUserView = {
  readonly id: string;
  readonly enabled: boolean;
  readonly emailVerified: boolean;
};

async function getAsMaster(environment: IdentityEnvironment, path: string): Promise<unknown> {
  const token = await fetchMasterAdminToken(environment);
  const result = await sendRequest({ url: `${buildAdminUrl(environment)}${path}`, token });
  assertCondition(result.status === 200, `GET ${path}: ${result.status}`);
  return JSON.parse(result.text) as unknown;
}

export async function readKeycloakUser(
  environment: IdentityEnvironment,
  userId: string,
): Promise<KeycloakUserView> {
  const user = await getAsMaster(environment, `/users/${userId}`);
  assertCondition(isJsonRecord(user), 'usuário do Keycloak ilegível');
  return {
    id: String(user['id']),
    enabled: user['enabled'] === true,
    emailVerified: user['emailVerified'] === true,
  };
}

export async function findKeycloakUserByEmail(
  environment: IdentityEnvironment,
  email: string,
): Promise<KeycloakUserView | undefined> {
  const users = await getAsMaster(
    environment,
    `/users?exact=true&email=${encodeURIComponent(email)}`,
  );
  const first: unknown = Array.isArray(users) ? users[0] : undefined;
  if (!isJsonRecord(first)) return undefined;
  return {
    id: String(first['id']),
    enabled: first['enabled'] === true,
    emailVerified: first['emailVerified'] === true,
  };
}

export async function readRealmRoleNames(
  environment: IdentityEnvironment,
  userId: string,
): Promise<readonly string[]> {
  const roles = await getAsMaster(environment, `/users/${userId}/role-mappings/realm`);
  return Array.isArray(roles)
    ? roles.map((role: unknown) => (isJsonRecord(role) ? String(role['name']) : ''))
    : [];
}

export async function deleteKeycloakUsersWithPrefix(
  environment: IdentityEnvironment,
  prefix: string,
): Promise<void> {
  const users = await getAsMaster(
    environment,
    `/users?search=${encodeURIComponent(prefix)}&max=100`,
  );
  const token = await fetchMasterAdminToken(environment);
  for (const user of Array.isArray(users) ? (users as readonly unknown[]) : []) {
    if (!isJsonRecord(user)) continue;
    await sendRequest({
      url: `${buildAdminUrl(environment)}/users/${String(user['id'])}`,
      method: 'DELETE',
      token,
    });
  }
}
