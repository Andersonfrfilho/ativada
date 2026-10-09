// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { ME_PATH } from '../apps/api-crypto/src/profile/profile.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { callAdmin, readError } from './fixtures/admin-calls.fixture.js';
import {
  ADMIN_ID,
  ADMIN_SUBJECT,
  MEMBER_ID,
  MEMBER_SUBJECT,
  OTHER_ADMIN_ID,
  OTHER_MEMBER_ID,
  OTHER_MEMBER_SUBJECT,
  UNKNOWN_ACCOUNT_ID,
  createAdminHarness,
  type AdminHarness,
} from './fixtures/admin-harness.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

let harness: AdminHarness;

beforeEach(async () => {
  harness = await createAdminHarness();
});

afterEach(async () => {
  await harness.stop();
});

const blockPath = (accountId: string): string => `/v1/admin/accounts/${accountId}/block`;
const unblockPath = (accountId: string): string => `/v1/admin/accounts/${accountId}/unblock`;

function storedUser(id: string): { blockedAt: Date | undefined } {
  const user = harness.users.users.get(userIdFromDatabase(id));
  if (user === undefined) throw new Error('user not seeded');
  return user;
}

function block(accountId: string, subject?: string): Promise<Response> {
  return callAdmin(harness, {
    path: blockPath(accountId),
    method: 'POST',
    ...(subject === undefined ? {} : { subject }),
  });
}

describe('POST /v1/admin/accounts/:accountId/block', () => {
  test('writes blocked_at in the database BEFORE disabling the user in Keycloak', async () => {
    const response = await block(MEMBER_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      data: { accountId: MEMBER_ID, isBlocked: true, isIdentityProviderSynced: true },
    });
    expect(harness.events).toStrictEqual([
      `database:blocked:${MEMBER_ID}`,
      `keycloak:enabled=false:${MEMBER_SUBJECT}`,
    ]);
    expect(storedUser(MEMBER_ID).blockedAt).toBeInstanceOf(Date);
    expect(harness.keycloak.admin.users.get(MEMBER_SUBJECT)?.enabled).toBe(false);
  });

  test('a blocked account is answered 403 ACCOUNT_BLOCKED on the next request', async () => {
    const before = await callAdmin(harness, { path: ME_PATH, subject: MEMBER_SUBJECT });
    await block(MEMBER_ID);
    const after = await callAdmin(harness, { path: ME_PATH, subject: MEMBER_SUBJECT });
    expect(before.status).toBe(200);
    expect(await readError(after)).toStrictEqual({ status: 403, code: 'ACCOUNT_BLOCKED' });
  });

  test('keeps the database block and reports it when Keycloak fails', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    const response = await block(MEMBER_ID);
    expect(response.status).toBe(202);
    expect(await response.json()).toStrictEqual({
      data: { accountId: MEMBER_ID, isBlocked: true, isIdentityProviderSynced: false },
    });
    expect(storedUser(MEMBER_ID).blockedAt).toBeInstanceOf(Date);
    expect(harness.store.auditLog.at(-1)?.payload).toStrictEqual({
      isIdentityProviderSynced: false,
    });
  });

  test('is idempotent and keeps the first blocked_at', async () => {
    await block(MEMBER_ID);
    const firstBlockedAt = storedUser(MEMBER_ID).blockedAt;
    const second = await block(MEMBER_ID);
    expect(second.status).toBe(200);
    expect(storedUser(MEMBER_ID).blockedAt).toBe(firstBlockedAt);
  });

  test('an administrator cannot block themselves', async () => {
    const response = await block(ADMIN_ID);
    expect(await readError(response)).toStrictEqual({ status: 409, code: 'CANNOT_BLOCK_SELF' });
    expect(storedUser(ADMIN_ID).blockedAt).toBeUndefined();
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.UPDATE_USER)).toHaveLength(0);
  });

  test('an administrator cannot block another administrator', async () => {
    const response = await block(OTHER_ADMIN_ID);
    expect(await readError(response)).toStrictEqual({ status: 409, code: 'CANNOT_BLOCK_ADMIN' });
    expect(storedUser(OTHER_ADMIN_ID).blockedAt).toBeUndefined();
    expect(harness.events).toStrictEqual([]);
  });

  test('the admin role is found even among composite and default roles', async () => {
    const roles = harness.keycloak.admin.users.get(OTHER_MEMBER_SUBJECT);
    if (roles !== undefined) roles.roles = ['default-roles-crypto-paper-trader', 'user', 'admin'];
    const response = await block(OTHER_MEMBER_ID);
    expect((await readError(response)).code).toBe('CANNOT_BLOCK_ADMIN');
    expect(storedUser(OTHER_MEMBER_ID).blockedAt).toBeUndefined();
  });

  test('refuses when the roles cannot be proven (forbidden or unavailable)', async () => {
    for (const failure of [harness.keycloak.admin.forbidden, harness.keycloak.admin.failing]) {
      failure.add(ADMIN_OPERATION.ROLES);
      const response = await block(MEMBER_ID);
      expect(await readError(response)).toStrictEqual({
        status: 503,
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
      failure.delete(ADMIN_OPERATION.ROLES);
    }
    expect(storedUser(MEMBER_ID).blockedAt).toBeUndefined();
    expect(harness.events).toStrictEqual([]);
  });

  test('a non administrator cannot block anyone', async () => {
    const response = await block(OTHER_MEMBER_ID, MEMBER_SUBJECT);
    expect(await readError(response)).toStrictEqual({ status: 403, code: 'FORBIDDEN' });
    expect(storedUser(OTHER_MEMBER_ID).blockedAt).toBeUndefined();
  });

  test('audits the action with the actor, target and address and no personal data', async () => {
    await block(MEMBER_ID);
    const [event] = harness.store.auditLog;
    expect(event).toMatchObject({
      actorUserId: ADMIN_ID,
      actorKind: 'admin',
      targetKind: 'account',
      targetId: MEMBER_ID,
      action: 'account.blocked',
      ip: '203.0.113.7',
    });
    expect(JSON.stringify(event)).not.toMatch(/example\.test|subject-/);
  });

  test('unknown, malformed and deleted ids are indistinguishable 404 ACCOUNT_NOT_FOUND', async () => {
    const deleted = storedUser(OTHER_MEMBER_ID) as { deletedAt?: Date };
    deleted.deletedAt = new Date();
    const deletedResponse = await block(OTHER_MEMBER_ID);
    const missingResponse = await block(UNKNOWN_ACCOUNT_ID);
    const malformedResponse = await block('not-a-uuid');
    await expectIndistinguishableNotFound({
      expectedCode: 'ACCOUNT_NOT_FOUND',
      foreignResourceResponse: deletedResponse,
      missingResourceResponse: missingResponse,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'ACCOUNT_NOT_FOUND',
      foreignResourceResponse: malformedResponse,
      missingResourceResponse: missingResponse,
    });
    expect(harness.events).toStrictEqual([]);
  });

  test('uppercase UUIDs are not valid account ids', async () => {
    const response = await block(MEMBER_ID.toUpperCase());
    expect(response.status).toBe(404);
  });
});

describe('POST /v1/admin/accounts/:accountId/unblock', () => {
  test('enables the user in Keycloak first and then clears blocked_at', async () => {
    await block(MEMBER_ID);
    harness.events.length = 0;
    const response = await callAdmin(harness, { path: unblockPath(MEMBER_ID), method: 'POST' });
    expect(response.status).toBe(200);
    expect(harness.events).toStrictEqual([
      `keycloak:enabled=true:${MEMBER_SUBJECT}`,
      `database:unblocked:${MEMBER_ID}`,
    ]);
    expect(storedUser(MEMBER_ID).blockedAt).toBeUndefined();
    const access = await callAdmin(harness, { path: ME_PATH, subject: MEMBER_SUBJECT });
    expect(access.status).toBe(200);
    expect(harness.store.auditLog.at(-1)).toMatchObject({ action: 'account.unblocked' });
  });

  test('keeps the account blocked when Keycloak cannot enable it', async () => {
    await block(MEMBER_ID);
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.UPDATE_USER);
    const response = await callAdmin(harness, { path: unblockPath(MEMBER_ID), method: 'POST' });
    expect((await readError(response)).code).toBe('IDENTITY_PROVIDER_UNAVAILABLE');
    expect(storedUser(MEMBER_ID).blockedAt).toBeInstanceOf(Date);
  });

  test('unknown ids answer 404 and the actor stays the administrator', async () => {
    const response = await callAdmin(harness, {
      path: unblockPath(UNKNOWN_ACCOUNT_ID),
      method: 'POST',
      subject: ADMIN_SUBJECT,
    });
    expect((await readError(response)).code).toBe('ACCOUNT_NOT_FOUND');
  });
});
