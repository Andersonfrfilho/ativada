// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { ACCOUNTS_PATH } from '../apps/api-crypto/src/admin/admin.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { callAdmin, readError } from './fixtures/admin-calls.fixture.js';
import {
  ADMIN_ID,
  MEMBER_ID,
  MEMBER_SUBJECT,
  OTHER_ADMIN_ID,
  OTHER_MEMBER_ID,
  createAdminHarness,
  type AdminHarness,
} from './fixtures/admin-harness.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';

type AccountsBody = {
  data: Record<string, unknown>[];
  pagination: { nextCursor: string | null; perPage: number };
};

let harness: AdminHarness;

beforeEach(async () => {
  harness = await createAdminHarness();
});

afterEach(async () => {
  await harness.stop();
});

async function listAccounts(query = '', subject?: string): Promise<Response> {
  return callAdmin(harness, {
    path: `${ACCOUNTS_PATH}${query}`,
    ...(subject === undefined ? {} : { subject }),
  });
}

describe('GET /v1/admin/accounts', () => {
  test('lists only the minimal account data, with the e-mail read from Keycloak', async () => {
    const response = await listAccounts();
    const body = (await response.json()) as AccountsBody;
    expect(response.status).toBe(200);
    expect(body.data.map((account) => account['id'])).toStrictEqual([
      ADMIN_ID,
      OTHER_ADMIN_ID,
      MEMBER_ID,
      OTHER_MEMBER_ID,
    ]);
    for (const account of body.data) {
      expect(Object.keys(account).sort()).toStrictEqual([
        'blockedAt',
        'createdAt',
        'deletedAt',
        'email',
        'id',
      ]);
    }
    expect(body.data[2]).toMatchObject({ email: 'membro.um@example.test', blockedAt: null });
    expect(body.pagination).toStrictEqual({ nextCursor: null, perPage: 50 });
  });

  test('shows the blocked state', async () => {
    const stored = harness.users.users.get(userIdFromDatabase(MEMBER_ID));
    if (stored !== undefined) stored.blockedAt = new Date('2026-10-05T10:00:00.000Z');
    const body = (await (await listAccounts()).json()) as AccountsBody;
    expect(body.data.find((account) => account['id'] === MEMBER_ID)?.['blockedAt']).toBe(
      '2026-10-05T10:00:00.000Z',
    );
  });

  test('paginates with an opaque cursor and walks every account once', async () => {
    const seen: unknown[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor === null ? '?limit=3' : `?limit=3&cursor=${cursor}`;
      const body = (await (await listAccounts(query)).json()) as AccountsBody;
      seen.push(...body.data.map((account) => account['id']));
      cursor = body.pagination.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(2);
    expect(seen).toStrictEqual([ADMIN_ID, OTHER_ADMIN_ID, MEMBER_ID, OTHER_MEMBER_ID]);
  });

  test.each([
    '?limit=101',
    '?limit=0',
    '?limit=abc',
    '?limit=1.5',
    '?cursor=%%%',
    '?cursor=bm9wZQ',
    '?page=2',
  ])('rejects %s with 400', async (query) => {
    const response = await listAccounts(query);
    expect((await readError(response)).code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('accepts the maximum page size of 100', async () => {
    const response = await listAccounts('?limit=100');
    expect(response.status).toBe(200);
    expect(((await response.json()) as AccountsBody).pagination.perPage).toBe(100);
  });

  test('keeps listing when an e-mail cannot be read', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    const body = (await (await listAccounts()).json()) as AccountsBody;
    expect(body.data).toHaveLength(4);
    expect(body.data.every((account) => account['email'] === null)).toBe(true);
  });

  test('a non administrator cannot list accounts', async () => {
    const response = await listAccounts('', MEMBER_SUBJECT);
    expect(await readError(response)).toStrictEqual({ status: 403, code: 'FORBIDDEN' });
  });

  test('the e-mail never reaches the log', async () => {
    await listAccounts();
    expect(harness.api.logLines.join('')).not.toContain('example.test');
  });
});
