// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { INVITATIONS_PATH } from '../apps/api-ativada/src/admin/admin.constant.js';
import { callAdmin, readError } from './fixtures/admin-calls.fixture.js';
import {
  ADMIN_ID,
  MEMBER_SUBJECT,
  OTHER_ADMIN_SUBJECT,
  OTHER_MEMBER_SUBJECT,
  REDIRECT_URI,
  SESSION_CLIENT,
  createAdminHarness,
  type AdminHarness,
} from './fixtures/admin-harness.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';

const NEW_EMAIL = 'Nova.Pessoa@Example.Test';
const INVITED_EMAIL = 'nova.pessoa@example.test';

let harness: AdminHarness;

beforeEach(async () => {
  harness = await createAdminHarness();
});

afterEach(async () => {
  await harness.stop();
});

function invite(body: unknown, subject?: string): Promise<Response> {
  return callAdmin(harness, {
    path: INVITATIONS_PATH,
    method: 'POST',
    body,
    ...(subject === undefined ? {} : { subject }),
  });
}

describe('POST /v1/admin/invitations', () => {
  test('requires the admin role and a second factor', async () => {
    const withoutToken = await harness.api.sendThroughHandler({
      path: INVITATIONS_PATH,
      method: 'POST',
    });
    expect(withoutToken.status).toBe(401);
    expect(await readError(await invite({ email: NEW_EMAIL }, MEMBER_SUBJECT))).toStrictEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    const withoutMfa = await callAdmin(harness, {
      path: INVITATIONS_PATH,
      method: 'POST',
      body: { email: NEW_EMAIL },
      token: { acr: 'password' },
    });
    expect(await readError(withoutMfa)).toStrictEqual({ status: 403, code: 'MFA_REQUIRED' });
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.CREATE)).toHaveLength(0);
  });

  test('creates a user with the default role only and sends a 24 hour action e-mail', async () => {
    const response = await invite({ email: NEW_EMAIL });
    expect(response.status).toBe(201);
    expect(await response.json()).toStrictEqual({ data: { isResend: false } });

    const [creation] = harness.keycloak.admin.callsOf(ADMIN_OPERATION.CREATE);
    expect(Object.keys(creation?.body as object).sort()).toStrictEqual([
      'email',
      'emailVerified',
      'enabled',
      'username',
    ]);
    expect(JSON.stringify(creation?.body)).not.toContain('admin');
    expect(creation?.body).toMatchObject({ email: INVITED_EMAIL, emailVerified: false });

    const [sending] = harness.keycloak.admin.callsOf(ADMIN_OPERATION.SEND_INVITATION);
    expect(sending?.query).toStrictEqual({
      lifespan: '86400',
      client_id: SESSION_CLIENT,
      redirect_uri: REDIRECT_URI,
    });
    expect(sending?.body).toStrictEqual(['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
    const created = [...harness.keycloak.admin.users.values()].find(
      (user) => user.email === INVITED_EMAIL,
    );
    expect(created?.roles).toStrictEqual(['user']);
  });

  test.each([
    ['a role', { email: NEW_EMAIL, role: 'admin' }],
    ['realm roles', { email: NEW_EMAIL, realmRoles: ['admin'] }],
    ['a user id', { email: NEW_EMAIL, userId: ADMIN_ID }],
    ['no email', {}],
    ['an invalid email', { email: 'not-an-email' }],
    ['a long email', { email: `${'a'.repeat(250)}@example.test` }],
    ['a non text email', { email: 42 }],
  ])('rejects a body with %s and calls nothing', async (_description, body) => {
    const response = await invite(body);
    expect(response.status).toBe(400);
    expect(harness.keycloak.admin.calls).toHaveLength(0);
    expect(harness.store.auditLog).toHaveLength(0);
  });

  test('does not echo the e-mail back in the answer or in the log', async () => {
    const response = await invite({ email: NEW_EMAIL });
    expect(await response.clone().text()).not.toContain('example.test');
    await invite({ email: 'not-an-email' });
    expect(harness.api.logLines.join('')).not.toContain('example.test');
  });

  test('audits the invitation without personal data', async () => {
    await invite({ email: NEW_EMAIL });
    expect(harness.store.auditLog).toHaveLength(1);
    const [event] = harness.store.auditLog;
    expect(event).toMatchObject({
      actorUserId: ADMIN_ID,
      actorKind: 'admin',
      targetKind: 'invitation',
      action: 'invitation.sent',
      ip: '203.0.113.7',
      payload: { isResend: false },
    });
    expect(JSON.stringify(event)).not.toContain('example.test');
  });

  test('a resend replaces the pending invitee so the old link stops working', async () => {
    await invite({ email: NEW_EMAIL });
    const [first] = [...harness.keycloak.admin.users.values()].filter(
      (user) => user.email === INVITED_EMAIL,
    );
    const response = await invite({ email: NEW_EMAIL });
    expect(await response.json()).toStrictEqual({ data: { isResend: true } });
    expect(harness.keycloak.admin.users.has(first?.id ?? '')).toBe(false);
    const current = [...harness.keycloak.admin.users.values()].filter(
      (user) => user.email === INVITED_EMAIL,
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.id).not.toBe(first?.id);
    const deleteIndex = harness.events.indexOf(`keycloak:delete:${first?.id}`);
    const lastInvite = harness.events.findLastIndex((entry) => entry.startsWith('keycloak:invite'));
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeLessThan(lastInvite);
    expect(harness.store.auditLog.at(-1)?.payload).toStrictEqual({ isResend: true });
  });

  test('refuses to resend to a person who already has credentials', async () => {
    harness.keycloak.admin.seedUser({
      id: 'subject-active',
      email: INVITED_EMAIL,
      credentialCount: 1,
    });
    const response = await invite({ email: NEW_EMAIL });
    expect(await readError(response)).toStrictEqual({
      status: 409,
      code: 'ACCOUNT_ALREADY_ACTIVE',
    });
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE)).toHaveLength(0);
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.SEND_INVITATION)).toHaveLength(0);
    expect(harness.keycloak.admin.users.has('subject-active')).toBe(true);
  });

  test('refuses to touch a person who already has an account in the product', async () => {
    harness.keycloak.admin.users.get(OTHER_MEMBER_SUBJECT)!.credentialCount = 0;
    const email = harness.keycloak.admin.users.get(OTHER_MEMBER_SUBJECT)?.email ?? '';
    const response = await invite({ email });
    expect(await readError(response)).toStrictEqual({
      status: 409,
      code: 'ACCOUNT_ALREADY_ACTIVE',
    });
    expect(harness.keycloak.admin.users.has(OTHER_MEMBER_SUBJECT)).toBe(true);
  });

  test.each([ADMIN_OPERATION.LOOKUP, ADMIN_OPERATION.CREATE, ADMIN_OPERATION.SEND_INVITATION])(
    'answers 503 and records nothing when %s fails',
    async (operation) => {
      harness.keycloak.admin.failing.add(operation);
      const response = await invite({ email: NEW_EMAIL });
      expect(await readError(response)).toStrictEqual({
        status: 503,
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
      expect(harness.store.auditLog).toHaveLength(0);
    },
  );

  test('is limited to 10 invitations per hour per administrator', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push((await invite({ email: `pessoa${index}@example.test` })).status);
    }
    expect(statuses.slice(0, 10)).toStrictEqual(Array<number>(10).fill(201));
    expect(statuses[10]).toBe(429);
    const another = await invite({ email: 'outra@example.test' }, OTHER_ADMIN_SUBJECT);
    expect(another.status).toBe(201);
  });
});
