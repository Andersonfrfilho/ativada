// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS } from '../apps/cron-crypto/src/cron.constant.js';
import {
  OWNED_TABLE_DELETION_ORDER,
  tableNameOf,
} from '../packages/database/src/ownership/ownership-registry.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { DATABASE_ERROR_PARAMETER } from './fixtures/in-memory-purge-store.fixture.js';
import { ADMIN_OPERATION } from './fixtures/fake-keycloak-admin.fixture.js';
import {
  ACCOUNT,
  HOUR_MILLISECONDS,
  START_OF_TEST,
  createPurgeHarness,
  type PurgeHarness,
} from './fixtures/purge-harness.fixture.js';

const RECENT = userIdFromDatabase(ACCOUNT.DELETED_RECENTLY.id);
const OLD = userIdFromDatabase(ACCOUNT.DELETED_LONG_AGO.id);
const ACTIVE = userIdFromDatabase(ACCOUNT.ACTIVE.id);
const ADMIN = userIdFromDatabase(ACCOUNT.ADMIN.id);
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

let harness: PurgeHarness;

beforeEach(() => {
  harness = createPurgeHarness();
  harness.store.seedAccount({
    id: ACCOUNT.DELETED_RECENTLY.id,
    subject: ACCOUNT.DELETED_RECENTLY.subject,
    deletedAt: new Date(START_OF_TEST - 2 * HOUR_MILLISECONDS),
  });
  harness.store.seedAccount({
    id: ACCOUNT.DELETED_LONG_AGO.id,
    subject: ACCOUNT.DELETED_LONG_AGO.subject,
    deletedAt: new Date(START_OF_TEST - 30 * HOUR_MILLISECONDS),
  });
  harness.store.seedAccount({ id: ACCOUNT.ACTIVE.id, subject: ACCOUNT.ACTIVE.subject });
  for (const userId of [RECENT, OLD, ACTIVE]) harness.store.seedOwnedRowsForEveryTable(userId);
});

afterEach(async () => {
  await harness.stop();
});

function eventsOf(id: string): readonly string[] {
  return harness.events.filter((event) => event.includes(`:${id}`));
}

describe('purge-deleted-accounts — order and steps', () => {
  test('runs step 2 (Keycloak) then step 3 (data), then the row, for a deleted account', async () => {
    const summary = await harness.task();
    expect(eventsOf(ACCOUNT.DELETED_LONG_AGO.subject)).toStrictEqual([
      `keycloak:delete:${ACCOUNT.DELETED_LONG_AGO.subject}`,
    ]);
    const steps = eventsOf(OLD).map((event) => event.split(':').slice(0, 2).join(':'));
    expect(steps).toStrictEqual([
      'database:identity-deleted',
      ...OWNED_TABLE_DELETION_ORDER.map(() => 'database:purge'),
      'database:data-purged',
      'database:removed',
    ]);
    expect(
      harness.events.indexOf(`keycloak:delete:${ACCOUNT.DELETED_LONG_AGO.subject}`),
    ).toBeLessThan(harness.events.indexOf(`database:data-purged:${OLD}`));
    expect(summary).toMatchObject({ examined: 2, failures: 0, rowsRemoved: 1 });
  });

  test('purges every owned table of the registry, children before parents, only for the deleted owner', async () => {
    await harness.task();
    const purged = harness.events
      .filter((event) => event.startsWith('database:purge:') && event.endsWith(`:${OLD}`))
      .map((event) => event.split(':')[2]);
    expect(purged).toStrictEqual(OWNED_TABLE_DELETION_ORDER.map(tableNameOf));
    expect(harness.store.ownedRows.filter((row) => row.userId === OLD)).toHaveLength(0);
    expect(harness.store.ownedRows.filter((row) => row.userId === RECENT)).toHaveLength(0);
  });

  test('never touches an active account: no Keycloak call, no purge, rows intact', async () => {
    await harness.task();
    expect(harness.keycloak.admin.users.has(ACCOUNT.ACTIVE.subject)).toBe(true);
    expect(
      harness.events.some(
        (event) => event.includes(ACTIVE) || event.includes(ACCOUNT.ACTIVE.subject),
      ),
    ).toBe(false);
    expect(harness.store.ownedRows.filter((row) => row.userId === ACTIVE).length).toBe(
      OWNED_TABLE_DELETION_ORDER.length,
    );
    expect(harness.store.accounts.get(ACTIVE)?.displayName).toBe('Personal Name');
  });

  test('a user already gone from Keycloak (404) counts as step 2 done', async () => {
    harness.keycloak.admin.users.delete(ACCOUNT.DELETED_LONG_AGO.subject);
    const summary = await harness.task();
    expect(summary.failures).toBe(0);
    expect(harness.store.accounts.has(OLD)).toBe(false);
  });
});

describe('purge-deleted-accounts — idempotence and resume', () => {
  test('running again changes nothing and does not call Keycloak a second time', async () => {
    await harness.task();
    const callsAfterFirst = harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE).length;
    const eventsAfterFirst = harness.events.length;
    const second = await harness.task();
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE)).toHaveLength(callsAfterFirst);
    expect(harness.events).toHaveLength(eventsAfterFirst);
    expect(second).toMatchObject({
      identitiesDeleted: 0,
      dataPurged: 0,
      rowsRemoved: 0,
      failures: 0,
    });
  });

  test('resumes after a failure between step 2 and step 3 without repeating step 2', async () => {
    harness.store.failures.purgeDataOnce.add(OLD);
    const first = await harness.task();
    expect(first.failures).toBeGreaterThan(0);
    const afterFailure = harness.store.accounts.get(OLD);
    expect(afterFailure?.identityDeletedAt).toBeInstanceOf(Date);
    expect(afterFailure?.dataPurgedAt).toBeUndefined();
    const deletesBefore = harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE).length;
    const second = await harness.task();
    expect(second.failures).toBe(0);
    expect(harness.keycloak.admin.callsOf(ADMIN_OPERATION.DELETE)).toHaveLength(deletesBefore);
    expect(harness.store.accounts.has(OLD)).toBe(false);
    expect(harness.store.ownedRows.filter((row) => row.userId === OLD)).toHaveLength(0);
  });

  test('a Keycloak outage leaves step 2 pending, still purges the data and keeps the row until it recovers', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.DELETE);
    const first = await harness.task();
    expect(first.failures).toBeGreaterThan(0);
    const stuck = harness.store.accounts.get(OLD);
    expect(stuck?.identityDeletedAt).toBeUndefined();
    expect(stuck?.dataPurgedAt).toBeInstanceOf(Date);
    harness.keycloak.admin.failing.clear();
    expect((await harness.task()).failures).toBe(0);
    expect(harness.store.accounts.has(OLD)).toBe(false);
  });

  test('a failing row removal is reported and retried on the next run', async () => {
    harness.store.failures.removalOnce.add(OLD);
    expect((await harness.task()).failures).toBe(1);
    expect(harness.store.accounts.has(OLD)).toBe(true);
    expect((await harness.task()).failures).toBe(0);
    expect(harness.store.accounts.has(OLD)).toBe(false);
  });
});

describe('purge-deleted-accounts — the users row', () => {
  test('keeps the row until 24 h after deleted_at even with both columns filled', async () => {
    await harness.task();
    expect(harness.store.accounts.has(RECENT)).toBe(true);
    expect(harness.store.accounts.get(RECENT)?.identityDeletedAt).toBeInstanceOf(Date);
    expect(harness.store.accounts.get(RECENT)?.dataPurgedAt).toBeInstanceOf(Date);
    const deletedAt = harness.store.accounts.get(RECENT)?.deletedAt?.getTime() ?? 0;
    harness.clock.advance(
      deletedAt + ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS - 1 - harness.clock.now(),
    );
    await harness.task();
    expect(harness.store.accounts.has(RECENT)).toBe(true);
    harness.clock.advance(1);
    await harness.task();
    expect(harness.store.accounts.has(RECENT)).toBe(false);
  });

  test('the grace period of the task is the 24 h of the ADR', () => {
    expect(ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS).toBe(DAY_MILLISECONDS);
  });

  test('never removes a row whose columns are not both filled, however old it is', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.DELETE);
    await harness.task();
    harness.clock.advance(30 * DAY_MILLISECONDS);
    await harness.task();
    expect(harness.store.accounts.has(OLD)).toBe(true);
    expect(harness.store.accounts.get(OLD)?.identityDeletedAt).toBeUndefined();
  });
});

describe('purge-deleted-accounts — audit_events', () => {
  beforeEach(() => {
    const at = (offsetHours: number): Date =>
      new Date(START_OF_TEST + offsetHours * HOUR_MILLISECONDS);
    harness.store.auditLog.push(
      {
        action: 'account.deletion_requested',
        actorUserId: OLD,
        targetId: OLD,
        ip: '203.0.113.1',
        createdAt: at(-30),
      },
      {
        action: 'account.blocked',
        actorUserId: ADMIN,
        targetId: OLD,
        ip: '198.51.100.2',
        createdAt: at(-40),
      },
      {
        action: 'account.blocked',
        actorUserId: ADMIN,
        targetId: ACTIVE,
        ip: '198.51.100.3',
        createdAt: at(-40),
      },
    );
  });

  test('is pseudonymized and never deleted when the account is purged', async () => {
    await harness.task();
    expect(harness.store.auditLog).toHaveLength(3);
    const [asActor, asTarget, other] = harness.store.auditLog;
    expect(asActor).toMatchObject({ actorUserId: undefined, targetId: undefined, ip: undefined });
    expect(asTarget).toMatchObject({ actorUserId: ADMIN, targetId: undefined, ip: '198.51.100.2' });
    expect(other).toMatchObject({ actorUserId: ADMIN, targetId: ACTIVE, ip: '198.51.100.3' });
    expect(harness.store.auditLog.map((event) => event.action)).toStrictEqual([
      'account.deletion_requested',
      'account.blocked',
      'account.blocked',
    ]);
  });

  test('drops the address of events older than 90 days and keeps the recent ones', async () => {
    harness.store.auditLog.push(
      {
        action: 'invitation.sent',
        actorUserId: ADMIN,
        targetId: undefined,
        ip: '198.51.100.8',
        createdAt: new Date(START_OF_TEST - 91 * DAY_MILLISECONDS),
      },
      {
        action: 'invitation.sent',
        actorUserId: ADMIN,
        targetId: undefined,
        ip: '198.51.100.9',
        createdAt: new Date(START_OF_TEST - 89 * DAY_MILLISECONDS),
      },
    );
    const summary = await harness.task();
    expect(summary.auditIpsExpired).toBe(1);
    expect(harness.store.auditLog.at(-2)?.ip).toBeUndefined();
    expect(harness.store.auditLog.at(-1)?.ip).toBe('198.51.100.9');
    expect(harness.store.auditLog).toHaveLength(5);
  });
});

describe('purge-deleted-accounts — logging', () => {
  test('logs no e-mail, Keycloak subject or personal name, even when steps fail', async () => {
    harness.keycloak.admin.failing.add(ADMIN_OPERATION.DELETE);
    harness.store.failures.purgeDataOnce.add(OLD);
    await harness.task();
    const log = harness.logLines.join('');
    expect(log).toContain('purge step failed');
    for (const personal of [
      ACCOUNT.DELETED_LONG_AGO.email,
      ACCOUNT.DELETED_LONG_AGO.subject,
      ACCOUNT.DELETED_RECENTLY.subject,
      'Personal Name',
    ]) {
      expect(log).not.toContain(personal);
    }
  });
});

const FAILING_ACCOUNT_COUNT = 100;
const FRESH_ACCOUNT_COUNT = 5;
const WAITING_ACCOUNT_COUNT = 150;
const MAXIMUM_PARALLEL_ACCOUNTS = 10;

function bulkId(prefix: string, index: number): string {
  return `0192f3a1-7c4e-7b2a-${prefix}-${String(index).padStart(12, '0')}`;
}

function seedBulk(params: {
  readonly prefix: string;
  readonly count: number;
  readonly deletedAt: Date;
  readonly isDone?: boolean;
}): readonly string[] {
  const ids: string[] = [];
  for (let index = 0; index < params.count; index += 1) {
    const id = bulkId(params.prefix, index);
    const subject = `subject-${params.prefix}-${index}`;
    harness.keycloak.admin.seedUser({ id: subject, email: `${subject}@example.test` });
    harness.store.seedAccount({
      id,
      subject,
      deletedAt: params.deletedAt,
      ...(params.isDone === true
        ? { identityDeletedAt: params.deletedAt, dataPurgedAt: params.deletedAt }
        : {}),
    });
    ids.push(id);
  }
  return ids;
}

describe('purge-deleted-accounts — queue without starvation', () => {
  test('processes new accounts even when 100 older ones fail on every run and 150 only wait out the grace period', async () => {
    const failingIds = seedBulk({
      prefix: 'aaaa',
      count: FAILING_ACCOUNT_COUNT,
      deletedAt: new Date(START_OF_TEST - 40 * HOUR_MILLISECONDS),
    });
    for (const id of failingIds) harness.store.failures.purgeDataAlways.add(userIdFromDatabase(id));
    seedBulk({
      prefix: 'bbbb',
      count: WAITING_ACCOUNT_COUNT,
      deletedAt: new Date(START_OF_TEST - HOUR_MILLISECONDS),
      isDone: true,
    });
    const freshIds = seedBulk({
      prefix: 'cccc',
      count: FRESH_ACCOUNT_COUNT,
      deletedAt: new Date(START_OF_TEST - HOUR_MILLISECONDS / 2),
    });
    const summary = await harness.task();
    for (const id of freshIds) {
      const fresh = harness.store.accounts.get(userIdFromDatabase(id));
      expect(fresh?.identityDeletedAt).toBeInstanceOf(Date);
      expect(fresh?.dataPurgedAt).toBeInstanceOf(Date);
    }
    expect(summary.examined).toBe(2 + FAILING_ACCOUNT_COUNT + FRESH_ACCOUNT_COUNT);
    expect(summary.failures).toBe(FAILING_ACCOUNT_COUNT);
  });

  test('works through at most ten accounts at a time', async () => {
    seedBulk({
      prefix: 'dddd',
      count: 60,
      deletedAt: new Date(START_OF_TEST - HOUR_MILLISECONDS),
    });
    await harness.task();
    expect(harness.store.stats.peakConcurrentPurges).toBeGreaterThan(1);
    expect(harness.store.stats.peakConcurrentPurges).toBeLessThanOrEqual(MAXIMUM_PARALLEL_ACCOUNTS);
  });

  test('logs the Postgres code of a database failure, never its query or parameters', async () => {
    harness.store.failures.databaseErrorOnce.add(OLD);
    await harness.task();
    const log = harness.logLines.join('');
    expect(log).toContain('23505');
    expect(log).not.toContain(DATABASE_ERROR_PARAMETER);
    expect(log).not.toContain('Failed query');
  });

  test('logs the opaque id of the account that failed, never the subject', async () => {
    harness.store.failures.purgeDataOnce.add(OLD);
    await harness.task();
    const log = harness.logLines.join('');
    expect(log).toContain(OLD);
    expect(log).not.toContain(ACCOUNT.DELETED_LONG_AGO.subject);
  });
});

describe('purge-deleted-accounts — Keycloak 404', () => {
  test('a 404 that is not "user not found" is an error, never "identity deleted"', async () => {
    harness.keycloak.admin.behavior.hasBareNotFound = true;
    harness.keycloak.admin.users.delete(ACCOUNT.DELETED_LONG_AGO.subject);
    const summary = await harness.task();
    expect(harness.store.accounts.get(OLD)?.identityDeletedAt).toBeUndefined();
    expect(summary.failures).toBeGreaterThan(0);
  });

  test('refuses to start when the realm or the Admin API URL does not exist', async () => {
    const wrong = createPurgeHarness({ adminPath: '/realms/missing' });
    try {
      wrong.store.seedAccount({
        id: ACCOUNT.DELETED_LONG_AGO.id,
        subject: ACCOUNT.DELETED_LONG_AGO.subject,
        deletedAt: new Date(START_OF_TEST - 30 * HOUR_MILLISECONDS),
      });
      const failure = await wrong.task().catch((error: unknown) => error);
      expect(failure).toMatchObject({ name: 'IdentityRealmUnavailableError' });
      expect(wrong.store.accounts.get(OLD)?.identityDeletedAt).toBeUndefined();
    } finally {
      await wrong.stop();
    }
  });
});
