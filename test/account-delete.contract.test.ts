// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { ME_EXPORT_PATH } from '../apps/api-crypto/src/account/account.constant.js';
import { ME_PATH } from '../apps/api-crypto/src/profile/profile.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  OWNER_A,
  OWNER_B,
  createAccountHarness,
  type AccountHarness,
} from './fixtures/account-harness.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';

const MINUTE_SECONDS = 60;
const TOLERANCE_SECONDS = 10;
const MAX_AGE_SECONDS = 5 * MINUTE_SECONDS;

let harness: AccountHarness;

beforeEach(async () => {
  harness = await createAccountHarness();
});

afterEach(async () => {
  await harness.stop();
});

function deleteWith(token: string): Promise<Response> {
  return harness.api.sendThroughHandler({ path: ME_PATH, method: 'DELETE', token });
}

async function errorCodeOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

function storedUser(id: string): { deletedAt: Date | undefined } {
  const user = harness.users.users.get(userIdFromDatabase(id));
  if (user === undefined) throw new Error('user not seeded');
  return user;
}

function expectNothingHappened(): void {
  expect(storedUser(OWNER_A.id).deletedAt).toBeUndefined();
  expect(harness.store.auditLog).toHaveLength(0);
  expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.LOGOUT)).toHaveLength(0);
}

describe('DELETE /v1/me — recent authentication', () => {
  test('requires authentication', async () => {
    const response = await harness.api.sendThroughHandler({ path: ME_PATH, method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  test('refuses a token without auth_time with 403 REAUTH_REQUIRED and changes nothing', async () => {
    const response = await deleteWith(await harness.tokenWithoutAuthTime(OWNER_A.subject));
    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('REAUTH_REQUIRED');
    expectNothingHappened();
  });

  test('refuses a login older than five minutes (plus the clock tolerance) and one from the future', async () => {
    const tooOld = await harness.tokenFor(OWNER_A.subject, MAX_AGE_SECONDS + TOLERANCE_SECONDS + 5);
    const fromFuture = await harness.tokenFor(OWNER_A.subject, -3_600);
    for (const token of [tooOld, fromFuture]) {
      const response = await deleteWith(token);
      expect(response.status).toBe(403);
      expect(await errorCodeOf(response)).toBe('REAUTH_REQUIRED');
    }
    expectNothingHappened();
  });

  test('accepts a login at the edge of the five minutes', async () => {
    const response = await deleteWith(await harness.tokenFor(OWNER_A.subject, MAX_AGE_SECONDS));
    expect(response.status).toBe(202);
  });
});

describe('DELETE /v1/me — step 1', () => {
  test('answers 202 deletion_started, marks only the caller, audits and logs the user out, in that order', async () => {
    const response = await deleteWith(await harness.tokenFor(OWNER_A.subject));
    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toStrictEqual({ data: { status: 'deletion_started' } });
    expect(storedUser(OWNER_A.id).deletedAt).toBeInstanceOf(Date);
    expect(storedUser(OWNER_B.id).deletedAt).toBeUndefined();
    expect(harness.events).toStrictEqual([
      'audit:account.deletion_requested',
      `database:deleted:${OWNER_A.id}`,
      `keycloak:logout:${OWNER_A.subject}`,
    ]);
    expect(harness.store.auditLog[0]).toMatchObject({
      actorUserId: OWNER_A.id,
      actorKind: 'user',
      targetKind: 'account',
      targetId: OWNER_A.id,
      payload: {},
    });
  });

  test('does not run steps 2 and 3 inside the request: the Keycloak user stays and no data is purged', async () => {
    harness.telegram.linkCodes.set(userIdFromDatabase(OWNER_A.id), {
      userId: userIdFromDatabase(OWNER_A.id),
      codeHash: 'a-hash',
      expiresAt: new Date(),
      attempts: 0,
    });
    await deleteWith(await harness.tokenFor(OWNER_A.subject));
    expect(harness.keycloak.admin.users.has(OWNER_A.subject)).toBe(true);
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE)).toHaveLength(0);
    expect(harness.telegram.linkCodes.has(userIdFromDatabase(OWNER_A.id))).toBe(true);
  });

  test('still answers 202 when the session cannot be ended in Keycloak', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.LOGOUT);
    const response = await deleteWith(await harness.tokenFor(OWNER_A.subject));
    expect(response.status).toBe(202);
    expect(storedUser(OWNER_A.id).deletedAt).toBeInstanceOf(Date);
  });

  test('turns the account into 401 ACCOUNT_DELETED for every route, and the second call is idempotent', async () => {
    const token = await harness.tokenFor(OWNER_A.subject);
    expect((await deleteWith(token)).status).toBe(202);
    for (const attempt of [
      deleteWith(token),
      harness.api.sendThroughHandler({ path: ME_PATH, token }),
      harness.api.sendThroughHandler({ path: ME_EXPORT_PATH, token }),
    ]) {
      const response = await attempt;
      expect(response.status).toBe(401);
      expect(await errorCodeOf(response)).toBe('ACCOUNT_DELETED');
    }
    expect(harness.store.auditLog).toHaveLength(1);
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.LOGOUT)).toHaveLength(1);
  });

  test('leaves the other account fully working', async () => {
    await deleteWith(await harness.tokenFor(OWNER_A.subject));
    const response = await harness.api.sendThroughHandler({
      path: ME_PATH,
      token: await harness.tokenFor(OWNER_B.subject),
    });
    expect(response.status).toBe(200);
  });

  test('keeps personal data out of the logs', async () => {
    await deleteWith(await harness.tokenFor(OWNER_A.subject));
    const log = harness.api.logLines.join('');
    for (const personal of [OWNER_A.email, OWNER_A.chatId, OWNER_A.displayName]) {
      expect(log).not.toContain(personal);
    }
  });
});
