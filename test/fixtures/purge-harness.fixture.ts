// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPurgeDeletedAccountsTask,
  type PurgeDeletedAccountsTask,
} from '../../apps/cron-crypto/src/accounts/purge-deleted-accounts.task.js';
import { ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS } from '../../apps/cron-crypto/src/cron.constant.js';
import { createCronLogger } from '../../apps/cron-crypto/src/logging/cron-logger.js';
import { createKeycloakIdentityAdmin } from '../../packages/identity-admin/src/create-keycloak-identity-admin.js';
import {
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
} from './fake-keycloak-admin.fixture.js';
import { startFakeKeycloak, type FakeKeycloak } from './fake-keycloak.fixture.js';
import {
  createInMemoryPurgeStore,
  type InMemoryPurgeStore,
} from './in-memory-purge-store.fixture.js';

export const HOUR_MILLISECONDS = 3_600_000;
export const START_OF_TEST = Date.parse('2026-10-09T12:00:00.000Z');

export const ACCOUNT = {
  DELETED_RECENTLY: {
    id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b01',
    subject: 'subject-deleted-recently',
    email: 'recent@example.test',
  },
  DELETED_LONG_AGO: {
    id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b02',
    subject: 'subject-deleted-long-ago',
    email: 'old@example.test',
  },
  ACTIVE: {
    id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b03',
    subject: 'subject-active',
    email: 'active@example.test',
  },
  ADMIN: {
    id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b04',
    subject: 'subject-admin',
    email: 'admin@example.test',
  },
} as const;

export type PurgeHarness = {
  readonly store: InMemoryPurgeStore;
  readonly keycloak: FakeKeycloak;
  readonly events: string[];
  readonly logLines: string[];
  readonly task: PurgeDeletedAccountsTask;
  readonly clock: { advance: (milliseconds: number) => void; now: () => number };
  readonly stop: () => Promise<void>;
};

export function createPurgeHarness(): PurgeHarness {
  const events: string[] = [];
  const logLines: string[] = [];
  let nowMilliseconds = START_OF_TEST;
  const clock = {
    advance: (milliseconds: number): void => {
      nowMilliseconds += milliseconds;
    },
    now: (): number => nowMilliseconds,
  };
  const keycloak = startFakeKeycloak({
    issueAccessToken: () => Promise.reject(new Error('not used')),
    events,
  });
  const store = createInMemoryPurgeStore({ events, now: clock.now });
  for (const account of Object.values(ACCOUNT)) {
    keycloak.admin.seedUser({ id: account.subject, email: account.email, credentialCount: 1 });
  }
  const task = createPurgeDeletedAccountsTask({
    repository: store.repository,
    identity: createKeycloakIdentityAdmin({
      adminApiUrl: keycloak.adminApiUrl,
      tokenUrl: keycloak.tokenUrl,
      clientId: FAKE_SERVICE_CLIENT_ID,
      clientSecret: FAKE_SERVICE_CLIENT_SECRET,
      now: clock.now,
    }),
    logger: createCronLogger({
      appName: 'cron-crypto',
      write: (line) => void logLines.push(line),
    }),
    now: clock.now,
    gracePeriodMilliseconds: ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS,
  });
  return { store, keycloak, events, logLines, task, clock, stop: () => keycloak.stop() };
}
