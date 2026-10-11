// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { AccountExportChunk } from '../packages/database/src/index.js';
import { ME_EXPORT_PATH } from '../apps/api-cryptoada/src/account/account.constant.js';
import { RATE_LIMIT_ERROR_CODE } from '../apps/api-cryptoada/src/shared/errors/error-code.constant.js';
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
import { parseExportText } from './fixtures/account-export-ndjson.fixture.js';
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

  test('is a no-store NDJSON attachment: header, one line per record and a closing line with the counts', async () => {
    const response = await exportAs(OWNER_A.subject);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toStartWith('application/x-ndjson');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="cryptoada-export-\d{4}-\d{2}-\d{2}\.ndjson"$/,
    );
    const text = await response.text();
    expect(text.endsWith('\n')).toBe(true);
    const document = parseExportText(text);
    expect(document.lineTypes[0]).toBe('header');
    expect(document.lineTypes.at(-1)).toBe('end');
    expect(Object.keys(document).sort()).toStrictEqual([
      'account',
      'auditEvents',
      'counts',
      'exportedAt',
      'lineTypes',
      'tables',
    ]);
    const records = document.lineTypes.filter((type) => type === 'row' || type === 'audit');
    const counted = Object.values(document.counts ?? {}).reduce((sum, count) => sum + count, 0);
    expect(counted).toBe(records.length);
    expect(document.counts?.['telegram_link_codes']).toBe(1);
  });

  test('carries the owner data, the e-mail from the identity provider and nothing of the other owner', async () => {
    const response = await exportAs(OWNER_A.subject);
    const text = await response.text();
    const document = parseExportText(text);
    expect(document.account).toMatchObject({
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
    const body = parseExportText(await response.text());
    const { asActor, asTarget } = body.auditEvents;
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

  test('answers 503 when the e-mail cannot be read from the identity provider', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    const response = await exportAs(OWNER_A.subject);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IDENTITY_PROVIDER_UNAVAILABLE');
  });

  test('a failed export does not spend the hourly quota; the successful one does', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await exportAs(OWNER_A.subject)).status).toBe(503);
    }
    harness.keycloak.admin.failing.clear();
    expect((await exportAs(OWNER_A.subject)).status).toBe(200);
    expect((await exportAs(OWNER_A.subject)).status).toBe(429);
  });

  test('two exports at the same time cannot both run inside one quota', async () => {
    const statuses = (
      await Promise.all([exportAs(OWNER_A.subject), exportAs(OWNER_A.subject)])
    ).map((response) => response.status);
    expect(statuses.sort()).toStrictEqual([200, 429]);
  });

  test('keeps the e-mail, the chat and the display name out of the logs', async () => {
    await exportAs(OWNER_A.subject);
    const log = harness.api.logLines.join('');
    for (const personal of [OWNER_A.email, OWNER_A.chatId, OWNER_A.displayName]) {
      expect(log).not.toContain(personal);
    }
  });
});

describe('GET /v1/me/export in streaming', () => {
  async function readLines(response: Response, limit: number): Promise<string[]> {
    const decoder = new TextDecoder();
    const lines: string[] = [];
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      lines.push(
        ...decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line.length > 0),
      );
      if (lines.length >= limit) break;
    }
    return lines;
  }

  test('pages the tables and pulls one page at a time: reading the first lines does not load the rest', async () => {
    await harness.stop();
    harness = await createAccountHarness({ exportPageSize: 10 });
    harness.store.bulk.set(
      'runs',
      Array.from({ length: 35 }, (_unused, index) => ({ id: `run-${index}` })),
    );
    const response = await exportAs(OWNER_A.subject);
    const firstLines = await readLines(response, 2);
    expect(JSON.parse(firstLines[0] ?? '{}')).toMatchObject({ type: 'header' });
    expect(harness.store.pagesRead.length).toBeLessThanOrEqual(2);
  });

  test('delivers every row of a paged table exactly once, in pages of at most the page size', async () => {
    await harness.stop();
    harness = await createAccountHarness({ exportPageSize: 10 });
    const rows = Array.from({ length: 35 }, (_unused, index) => ({ id: `run-${index}` }));
    harness.store.bulk.set('runs', rows);
    const document = parseExportText(await (await exportAs(OWNER_A.subject)).text());
    expect(document.tables['runs']?.map((row) => row['id'])).toStrictEqual(
      rows.map((row) => row.id),
    );
    expect(document.counts?.['runs']).toBe(35);
    expect(Math.max(...harness.store.pagesRead)).toBeLessThanOrEqual(10);
    expect(harness.store.pagesRead.filter((size) => size > 0).length).toBeGreaterThanOrEqual(4);
  });

  test('a failure in the middle aborts the stream instead of closing a file that looks complete', async () => {
    const original = harness.store.exports.streamOwnerRows;
    const failing: typeof original = (scope, options) =>
      (async function* (): AsyncGenerator<AccountExportChunk> {
        yield* original(scope, options);
        throw new Error('banco caiu');
      })();
    (harness.store.exports as { streamOwnerRows: typeof original }).streamOwnerRows = failing;
    const response = await exportAs(OWNER_A.subject);
    expect(response.status).toBe(200);
    const outcome = await response.text().then(
      () => 'completed',
      () => 'aborted',
    );
    expect(outcome).toBe('aborted');
  });

  test('a client that gives up cancels the read of the next pages', async () => {
    await harness.stop();
    harness = await createAccountHarness({ exportPageSize: 10 });
    harness.store.bulk.set(
      'runs',
      Array.from({ length: 100 }, (_unused, index) => ({ id: `run-${index}` })),
    );
    await readLines(await exportAs(OWNER_A.subject), 2);
    const pagesAtGiveUp = harness.store.pagesRead.length;
    await Bun.sleep(50);
    expect(harness.store.pagesRead.length).toBe(pagesAtGiveUp);
    expect(harness.store.closedReads.count).toBe(1);
  });
});
