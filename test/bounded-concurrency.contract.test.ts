// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createListAccountsUseCase } from '../apps/api-ativada/src/admin/list-accounts.use-case.js';
import { IDENTITY_OUTCOME } from '../packages/identity-admin/src/identity-admin.constant.js';
import { parseAccountId } from '../packages/database/src/admin/admin-account-id.js';
import type { AdminAccountRecord } from '../packages/database/src/index.js';

const BATCH_SIZE = 10;
const ACCOUNT_COUNT = 100;

function createRecords(): AdminAccountRecord[] {
  return Array.from({ length: ACCOUNT_COUNT }, (_, index) => ({
    id: parseAccountId(`0192f3a1-7c4e-7b2a-9d3f-${String(index).padStart(12, '0')}`) as never,
    keycloakSubject: `subject-${index}`,
    createdAt: new Date(0),
    blockedAt: undefined,
    deletedAt: undefined,
  }));
}

describe('list accounts — Keycloak reads', () => {
  test('reads at most ten e-mails at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const list = createListAccountsUseCase({
      accounts: {
        listAccounts: () => Promise.resolve({ items: createRecords(), hasMore: false }),
      },
      identity: {
        readEmail: async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await Bun.sleep(1);
          inFlight -= 1;
          return { status: IDENTITY_OUTCOME.OK, value: 'a@example.test' };
        },
      },
    });
    const result = await list({ after: undefined, limit: ACCOUNT_COUNT });
    expect(result.items).toHaveLength(ACCOUNT_COUNT);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(BATCH_SIZE);
  });

  test('a read that throws leaves that e-mail empty and does not fail the others', async () => {
    const list = createListAccountsUseCase({
      accounts: {
        listAccounts: () => Promise.resolve({ items: createRecords().slice(0, 3), hasMore: false }),
      },
      identity: {
        readEmail: (userId) =>
          userId === 'subject-1'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ status: IDENTITY_OUTCOME.OK, value: 'a@example.test' }),
      },
    });
    const result = await list({ after: undefined, limit: 3 });
    expect(result.items.map((item) => item.email)).toStrictEqual([
      'a@example.test',
      null,
      'a@example.test',
    ]);
  });
});
