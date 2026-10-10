// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from './identity-environment.js';
import {
  isJsonRecord,
  parseJsonRecord,
  readString,
  sendRequest,
  type HttpResult,
  type JsonRecord,
} from './http-client.js';

export const SESSION_CLIENT_ID = 'cryptoada-session';
export const SERVICE_CLIENT_ID = 'cryptoada-api-service';

export function buildRealmUrl(environment: IdentityEnvironment): string {
  return `${environment.keycloakUrl}/realms/${environment.realmName}`;
}

export function buildAdminUrl(environment: IdentityEnvironment): string {
  return `${environment.keycloakUrl}/admin/realms/${environment.realmName}`;
}

export function buildTokenEndpoint(environment: IdentityEnvironment): string {
  return `${buildRealmUrl(environment)}/protocol/openid-connect/token`;
}

export async function requestTokenGrant(
  environment: IdentityEnvironment,
  form: Readonly<Record<string, string>>,
): Promise<HttpResult> {
  return sendRequest({ url: buildTokenEndpoint(environment), form });
}

export async function fetchMasterAdminToken(environment: IdentityEnvironment): Promise<string> {
  const result = await sendRequest({
    url: `${environment.keycloakUrl}/realms/master/protocol/openid-connect/token`,
    form: {
      grant_type: 'password',
      client_id: 'admin-cli',
      username: environment.adminUser,
      password: environment.adminPassword,
    },
  });
  return readString(parseJsonRecord(result), 'access_token');
}

export async function fetchServiceAccountToken(environment: IdentityEnvironment): Promise<string> {
  const result = await requestTokenGrant(environment, {
    grant_type: 'client_credentials',
    client_id: SERVICE_CLIENT_ID,
    client_secret: environment.serviceClientSecret,
  });
  return readString(parseJsonRecord(result), 'access_token');
}

export function decodeTokenPayload(token: string): JsonRecord {
  const payload = token.split('.')[1] ?? '';
  const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!isJsonRecord(parsed)) throw new Error('JWT sem payload objeto');
  return parsed;
}
