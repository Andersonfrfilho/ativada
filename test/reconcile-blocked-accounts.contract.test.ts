// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createReconcileBlockedAccountsTask } from '../apps/cron-ativada/src/accounts/reconcile-blocked-accounts.task.js';
import type { BlockedAccountRepository } from '../packages/database/src/index.js';
import { createCronLogger } from '../apps/cron-ativada/src/logging/cron-logger.js';
import { createKeycloakIdentityAdmin } from '../packages/identity-admin/src/create-keycloak-identity-admin.js';
import {
  ADMIN_OPERATION,
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
} from './fixtures/fake-keycloak-admin.fixture.js';
import { startFakeKeycloak, type FakeKeycloak } from './fixtures/fake-keycloak.fixture.js';
import {
  createInMemoryBlockedAccountStore,
  type InMemoryBlockedAccountStore,
} from './fixtures/in-memory-blocked-account-store.fixture.js';

const BLOCKED_STILL_ENABLED = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c01';
const BLOCKED_ALREADY_DISABLED = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c02';
const ACTIVE = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c03';
const BLOCKED_GONE_FROM_KEYCLOAK = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c04';
const SUBJECT = (id: string): string => `subject-${id.slice(-2)}`;
const EMAIL = (id: string): string => `person-${id.slice(-2)}@example.test`;

let keycloak: FakeKeycloak;
let store: InMemoryBlockedAccountStore;
let logLines: string[];
let run: () => ReturnType<ReturnType<typeof createReconcileBlockedAccountsTask>>;

function buildTask(repository: BlockedAccountRepository = store.repository): typeof run {
  const task = createReconcileBlockedAccountsTask({
    repository,
    identity: createKeycloakIdentityAdmin({
      adminApiUrl: keycloak.adminApiUrl,
      tokenUrl: keycloak.tokenUrl,
      clientId: FAKE_SERVICE_CLIENT_ID,
      clientSecret: FAKE_SERVICE_CLIENT_SECRET,
      now: () => Date.now(),
    }),
    logger: createCronLogger({
      appName: 'cron-ativada',
      write: (line) => void logLines.push(line),
    }),
  });
  return task;
}

beforeEach(() => {
  logLines = [];
  keycloak = startFakeKeycloak({ issueAccessToken: () => Promise.reject(new Error('not used')) });
  store = createInMemoryBlockedAccountStore();
  for (const [id, isBlocked, isEnabled] of [
    [BLOCKED_STILL_ENABLED, true, true],
    [BLOCKED_ALREADY_DISABLED, true, false],
    [ACTIVE, false, true],
  ] as const) {
    store.seed({ id, subject: SUBJECT(id), isBlocked });
    keycloak.admin.seedUser({ id: SUBJECT(id), email: EMAIL(id) }).enabled = isEnabled;
  }
  run = buildTask();
});

afterEach(async () => {
  await keycloak.stop();
});

describe('reconcile-blocked-accounts', () => {
  test('disables a blocked account that is still enabled in Keycloak', async () => {
    const summary = await run();
    expect(keycloak.admin.users.get(SUBJECT(BLOCKED_STILL_ENABLED))?.enabled).toBe(false);
    expect(summary).toMatchObject({ examined: 2, disabled: 1, alreadyDisabled: 1, failures: 0 });
  });

  test('never touches an account that is not blocked', async () => {
    await run();
    expect(keycloak.admin.users.get(SUBJECT(ACTIVE))?.enabled).toBe(true);
    const touched = keycloak.admin.calls.filter((call) => call.userId === SUBJECT(ACTIVE));
    expect(touched).toHaveLength(0);
  });

  test('is idempotent: the second run writes nothing', async () => {
    await run();
    const updatesAfterFirst = keycloak.admin.callsOf(ADMIN_OPERATION.UPDATE_USER).length;
    const second = await run();
    expect(keycloak.admin.callsOf(ADMIN_OPERATION.UPDATE_USER)).toHaveLength(updatesAfterFirst);
    expect(second).toMatchObject({ disabled: 0, alreadyDisabled: 2, failures: 0 });
  });

  test('a user missing from Keycloak is counted, not a failure', async () => {
    store.seed({ id: BLOCKED_GONE_FROM_KEYCLOAK, subject: 'subject-gone', isBlocked: true });
    const summary = await run();
    expect(summary).toMatchObject({ missing: 1, failures: 0, disabled: 1 });
  });

  test('a Keycloak failure on one account does not stop the others', async () => {
    keycloak.admin.failing.add(ADMIN_OPERATION.READ_USER);
    const failed = await run();
    expect(failed.failures).toBe(2);
    keycloak.admin.failing.clear();
    const recovered = await run();
    expect(recovered).toMatchObject({ disabled: 1, failures: 0 });
  });

  test('a rejected write is a failure of that account only', async () => {
    const other = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c05';
    store.seed({ id: other, subject: SUBJECT(other), isBlocked: true });
    keycloak.admin.seedUser({ id: SUBJECT(other), email: EMAIL(other) });
    keycloak.admin.forbidden.add(ADMIN_OPERATION.UPDATE_USER);
    const summary = await run();
    expect(summary.failures).toBe(2);
    expect(summary.disabled).toBe(0);
  });

  test('an account unblocked while the run was going is left enabled', async () => {
    let reads = 0;
    const unblockedMeanwhile: BlockedAccountRepository = {
      ...store.repository,
      isStillBlocked: (accountId) => {
        reads += 1;
        store.accounts.set(accountId, {
          keycloakSubject: SUBJECT(accountId),
          isBlocked: false,
        });
        return store.repository.isStillBlocked(accountId);
      },
    };
    const summary = await buildTask(unblockedMeanwhile)();
    expect(reads).toBe(1);
    expect(summary).toMatchObject({ disabled: 0, skippedUnblocked: 1 });
    expect(keycloak.admin.users.get(SUBJECT(BLOCKED_STILL_ENABLED))?.enabled).toBe(true);
  });

  test('walks every page, not only the first', async () => {
    for (let index = 0; index < 250; index += 1) {
      const id = `0192f3a1-7c4e-7b2a-9d3f-bbbb${String(index).padStart(8, '0')}`;
      store.seed({ id, subject: `bulk-${index}`, isBlocked: true });
      keycloak.admin.seedUser({ id: `bulk-${index}`, email: `bulk-${index}@example.test` });
    }
    const summary = await run();
    expect(summary.examined).toBe(252);
    expect(summary.disabled).toBe(251);
  });

  test('logs the opaque account id and never the subject or the e-mail', async () => {
    keycloak.admin.failing.add(ADMIN_OPERATION.UPDATE_USER);
    await run();
    const log = logLines.join('');
    expect(log).toContain(BLOCKED_STILL_ENABLED);
    for (const personal of [SUBJECT(BLOCKED_STILL_ENABLED), EMAIL(BLOCKED_STILL_ENABLED)]) {
      expect(log).not.toContain(personal);
    }
  });
});
