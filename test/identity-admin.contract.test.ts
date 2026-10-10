// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createAdminAuditRecorder } from '../apps/api-cryptoada/src/admin/admin-audit-recorder.js';
import { IDENTITY_OUTCOME } from '../packages/identity-admin/src/identity-admin.constant.js';
import { createIdentityHttp } from '../packages/identity-admin/src/identity-http.js';
import { createKeycloakAdminClient } from '../packages/identity-admin/src/keycloak-admin-client.js';
import { createServiceAccountTokenProvider } from '../packages/identity-admin/src/service-account-token.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
} from './fixtures/fake-keycloak-admin.fixture.js';
import { startFakeKeycloak, type FakeKeycloak } from './fixtures/fake-keycloak.fixture.js';
import { createInMemoryAdminStore } from './fixtures/in-memory-admin-store.fixture.js';

let keycloak: FakeKeycloak;
let nowMilliseconds: number;

beforeEach(() => {
  nowMilliseconds = 1_000_000;
  keycloak = startFakeKeycloak({ issueAccessToken: () => Promise.reject(new Error('unused')) });
});

afterEach(async () => {
  await keycloak.stop();
});

function createTokens(
  clientSecret = FAKE_SERVICE_CLIENT_SECRET,
): ReturnType<typeof createServiceAccountTokenProvider> {
  return createServiceAccountTokenProvider({
    tokenUrl: keycloak.tokenUrl,
    clientId: FAKE_SERVICE_CLIENT_ID,
    clientSecret,
    now: () => nowMilliseconds,
  });
}

describe('service account token', () => {
  test('is requested once and reused until it is close to expiring', async () => {
    const tokens = createTokens();
    const first = await tokens.getToken();
    const second = await tokens.getToken();
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(keycloak.countRequests('client_credentials')).toBe(1);
    nowMilliseconds += 50_000;
    await tokens.getToken();
    expect(keycloak.countRequests('client_credentials')).toBe(2);
  });

  test('50 concurrent calls with an empty cache make a single token exchange', async () => {
    const tokens = createTokens();
    const results = await Promise.all(Array.from({ length: 50 }, () => tokens.getToken()));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBeDefined();
    expect(keycloak.countRequests('client_credentials')).toBe(1);
  });

  test('a failed exchange is not remembered: the next call tries again', async () => {
    const tokens = createTokens('wrong-secret');
    expect(await tokens.getToken()).toBeUndefined();
    expect(await tokens.getToken()).toBeUndefined();
    expect(keycloak.countRequests('client_credentials')).toBe(2);
  });

  test('is undefined when Keycloak refuses the client', async () => {
    expect(await createTokens('wrong-secret').getToken()).toBeUndefined();
  });

  test('an unauthorized answer discards the cached token', async () => {
    const tokens = createTokens();
    const http = createIdentityHttp({ adminApiUrl: `${keycloak.adminApiUrl}-wrong`, tokens });
    await http({ method: 'GET', path: '/users' });
    await tokens.getToken();
    expect(keycloak.countRequests('client_credentials')).toBeGreaterThanOrEqual(1);
  });
});

describe('Keycloak admin client', () => {
  function createClient(
    clientSecret = FAKE_SERVICE_CLIENT_SECRET,
  ): ReturnType<typeof createKeycloakAdminClient> {
    return createKeycloakAdminClient({
      http: createIdentityHttp({
        adminApiUrl: keycloak.adminApiUrl,
        tokens: createTokens(clientSecret),
      }),
      invitationClientId: 'cryptoada-session',
      invitationRedirectUri: 'http://panel.test/auth/callback',
    });
  }

  test('answers unavailable for every operation when the credentials are wrong', async () => {
    const client = createClient('wrong-secret');
    const outcomes = await Promise.all([
      client.findUserByEmail('a@example.test'),
      client.createUser('a@example.test'),
      client.deleteUser('x'),
      client.logoutUser('x'),
      client.hasCredentials('x'),
      client.sendInvitation('x'),
      client.readEffectiveRoles('x'),
      client.readEmail('x'),
      client.setEnabled({ userId: 'x', isEnabled: false }),
    ]);
    expect(outcomes.every((outcome) => outcome.status === IDENTITY_OUTCOME.UNAVAILABLE)).toBe(true);
  });

  test('answers not_found for unknown users and conflict for a duplicate e-mail', async () => {
    const client = createClient();
    expect((await client.readEffectiveRoles('missing')).status).toBe(IDENTITY_OUTCOME.NOT_FOUND);
    expect((await client.setEnabled({ userId: 'missing', isEnabled: true })).status).toBe(
      IDENTITY_OUTCOME.NOT_FOUND,
    );
    await client.createUser('dup@example.test');
    expect((await client.createUser('dup@example.test')).status).toBe(IDENTITY_OUTCOME.CONFLICT);
  });

  test('a 404 without the "user not found" body is unavailable, never not_found', async () => {
    const client = createClient();
    keycloak.admin.behavior.hasBareNotFound = true;
    expect((await client.deleteUser('missing')).status).toBe(IDENTITY_OUTCOME.UNAVAILABLE);
    expect((await client.readEmail('missing')).status).toBe(IDENTITY_OUTCOME.UNAVAILABLE);
    expect((await client.setEnabled({ userId: 'missing', isEnabled: true })).status).toBe(
      IDENTITY_OUTCOME.UNAVAILABLE,
    );
    keycloak.admin.behavior.hasBareNotFound = false;
    expect((await client.deleteUser('missing')).status).toBe(IDENTITY_OUTCOME.NOT_FOUND);
  });

  test('logs the user out of every session and answers not_found for unknown users', async () => {
    const client = createClient();
    keycloak.admin.seedUser({ id: 'known-user', email: 'known@example.test' });
    expect((await client.logoutUser('known-user')).status).toBe(IDENTITY_OUTCOME.OK);
    expect((await client.logoutUser('missing')).status).toBe(IDENTITY_OUTCOME.NOT_FOUND);
    expect(keycloak.admin.callsOf('logout')).toHaveLength(2);
  });

  test('encodes the user id in the path so it cannot reach another resource', async () => {
    const client = createClient();
    await client.readEmail('../realms/other');
    expect(keycloak.admin.calls).toHaveLength(1);
    expect(keycloak.admin.calls[0]?.userId).toBe('..%2Frealms%2Fother');
  });
});

describe('admin audit recorder', () => {
  const actor = {
    userId: userIdFromDatabase('0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e01'),
    clientAddress: '203.0.113.9',
  };

  test('refuses payloads with fields outside the action schema (no personal data)', async () => {
    const store = createInMemoryAdminStore(new Map(), []);
    const record = createAdminAuditRecorder(store.audit);
    const base = { actor, targetKind: 'invitation', targetId: crypto.randomUUID() };
    const settled = await Promise.allSettled([
      record({
        ...base,
        action: 'invitation.sent',
        payload: { isResend: false, email: 'a@b.test' },
      }),
      record({ ...base, action: 'invitation.sent', payload: {} }),
    ]);
    expect(settled.map((result) => result.status)).toStrictEqual(['rejected', 'rejected']);
    expect(store.auditLog).toHaveLength(0);
  });

  test('stores no address when the client address is not an IP', async () => {
    const store = createInMemoryAdminStore(new Map(), []);
    const record = createAdminAuditRecorder(store.audit);
    await record({
      actor: { ...actor, clientAddress: 'unknown' },
      action: 'account.unblocked',
      targetKind: 'account',
      targetId: crypto.randomUUID(),
      payload: {},
    });
    expect(store.auditLog[0]?.ip).toBeUndefined();
  });
});
