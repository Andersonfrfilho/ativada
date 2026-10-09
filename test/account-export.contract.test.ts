// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { ME_EXPORT_PATH } from '../apps/api-crypto/src/account/account.constant.js';
import { RATE_LIMIT_ERROR_CODE } from '../apps/api-crypto/src/shared/errors/error-code.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  ADMIN_ACTOR_ID,
  ADMIN_ACTOR_IP,
  OWNER_A,
  OWNER_A_IP,
  OWNER_B,
  createAccountHarness,
  type AccountHarness,
} from './fixtures/account-harness.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';

const HOUR_MILLISECONDS = 3_600_000;

let harness: AccountHarness;

beforeEach(async () => {
  harness = await createAccountHarness();
  const linkExpiry = new Date('2026-10-02T09:10:00.000Z');
  for (const owner of [OWNER_A, OWNER_B]) {
    harness.telegram.linkCodes.set(userIdFromDatabase(owner.id), {
      userId: userIdFromDatabase(owner.id),
      codeHash: `hash-of-${owner.subject}-must-never-leave`,
      expiresAt: linkExpiry,
      attempts: owner === OWNER_A ? 1 : 3,
    });
  }
  await harness.store.audit.record({
    actorUserId: userIdFromDatabase(OWNER_A.id),
    actorKind: 'user',
    targetKind: 'account',
    targetId: OWNER_A.id,
    action: 'account.deletion_requested',
    ip: OWNER_A_IP,
    payload: {},
  });
  await harness.store.audit.record({
    actorUserId: userIdFromDatabase(ADMIN_ACTOR_ID),
    actorKind: 'admin',
    targetKind: 'account',
    targetId: OWNER_A.id,
    action: 'account.blocked',
    ip: ADMIN_ACTOR_IP,
    payload: { isIdentityProviderSynced: true },
  });
  await harness.store.audit.record({
    actorUserId: userIdFromDatabase(OWNER_B.id),
    actorKind: 'user',
    targetKind: 'account',
    targetId: OWNER_B.id,
    action: 'account.deletion_requested',
    ip: '203.0.113.99',
    payload: {},
  });
  harness.events.length = 0;
});

afterEach(async () => {
  await harness.stop();
});

async function exportAs(subject: string): Promise<Response> {
  return harness.api.sendThroughHandler({
    path: ME_EXPORT_PATH,
    token: await harness.tokenFor(subject),
  });
}

describe('GET /v1/me/export', () => {
  test('requires authentication', async () => {
    const response = await harness.api.sendThroughHandler({ path: ME_EXPORT_PATH });
    expect(response.status).toBe(401);
  });

  test('is a no-store attachment with the data inside the envelope', async () => {
    const response = await exportAs(OWNER_A.subject);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="crypto-paper-trader-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toStrictEqual([
      'account',
      'auditEvents',
      'exportedAt',
      'tables',
    ]);
  });

  test('carries the owner data, the e-mail from the identity provider and nothing of the other owner', async () => {
    const response = await exportAs(OWNER_A.subject);
    const text = await response.text();
    const body = JSON.parse(text) as { data: { account: Record<string, unknown> } };
    expect(body.data.account).toMatchObject({
      email: OWNER_A.email,
      displayName: OWNER_A.displayName,
      telegramChatId: OWNER_A.chatId,
    });
    for (const foreign of [
      OWNER_B.id,
      OWNER_B.subject,
      OWNER_B.email,
      OWNER_B.chatId,
      OWNER_B.displayName,
      `hash-of-${OWNER_B.subject}`,
      '203.0.113.99',
    ]) {
      expect(text).not.toContain(foreign);
    }
  });

  test('never carries internal identifiers, the identity-provider subject or the link-code hash', async () => {
    const text = await (await exportAs(OWNER_A.subject)).text();
    for (const secret of [
      OWNER_A.subject,
      OWNER_A.id,
      'keycloak',
      'codeHash',
      'code_hash',
      `hash-of-${OWNER_A.subject}`,
      'deletedAt',
      'identityDeletedAt',
      'dataPurgedAt',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  test('exports the audit events where the owner is the actor, and where the owner is only the target without the other actor or their address', async () => {
    const response = await exportAs(OWNER_A.subject);
    const body = (await response.json()) as {
      data: {
        auditEvents: { asActor: Record<string, unknown>[]; asTarget: Record<string, unknown>[] };
      };
    };
    const { asActor, asTarget } = body.data.auditEvents;
    expect(asActor.map((event) => event['action'])).toStrictEqual(['account.deletion_requested']);
    expect(asActor[0]?.['ip']).toBe(OWNER_A_IP);
    expect(asTarget.map((event) => event['action'])).toStrictEqual(['account.blocked']);
    expect(Object.keys(asTarget[0] ?? {})).not.toContain('ip');
    expect(JSON.stringify(body)).not.toContain(ADMIN_ACTOR_IP);
    expect(JSON.stringify(body)).not.toContain(ADMIN_ACTOR_ID);
  });

  test('reads only with the scope of the token owner: B sees B and A is never queried', async () => {
    const text = await (await exportAs(OWNER_B.subject)).text();
    expect(text).toContain(OWNER_B.displayName);
    expect(text).not.toContain(OWNER_A.displayName);
    expect(text).not.toContain(OWNER_A.chatId);
    expect(harness.store.exportCalls).toStrictEqual([userIdFromDatabase(OWNER_B.id)]);
  });

  test('allows one export per hour per user, then 429 with Retry-After', async () => {
    expect((await exportAs(OWNER_A.subject)).status).toBe(200);
    const denied = await exportAs(OWNER_A.subject);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(Number(denied.headers.get('Retry-After'))).toBeLessThanOrEqual(3600);
    const body = (await denied.json()) as { error: { code: string } };
    expect(body.error.code).toBe(RATE_LIMIT_ERROR_CODE.RATE_LIMITED);
    expect((await exportAs(OWNER_B.subject)).status).toBe(200);
    harness.api.clock.advance(HOUR_MILLISECONDS);
    expect((await exportAs(OWNER_A.subject)).status).toBe(200);
  });

  test('still exports, with a null e-mail, when the identity provider is down', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    const response = await exportAs(OWNER_A.subject);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { account: Record<string, unknown> } };
    expect(body.data.account['email']).toBeNull();
  });

  test('keeps the e-mail, the chat and the display name out of the logs', async () => {
    await exportAs(OWNER_A.subject);
    const log = harness.api.logLines.join('');
    for (const personal of [OWNER_A.email, OWNER_A.chatId, OWNER_A.displayName]) {
      expect(log).not.toContain(personal);
    }
  });
});
