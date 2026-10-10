// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createDeleteAccountUseCase } from '../../apps/api-cryptoada/src/account/delete-account.use-case.js';
import { createAccountRoutes } from '../../apps/api-cryptoada/src/account/account.routes.js';
import { createExportAccountUseCase } from '../../apps/api-cryptoada/src/account/export-account.use-case.js';
import { createProfileRoutes } from '../../apps/api-cryptoada/src/profile/profile.routes.js';
import {
  createGetProfileUseCase,
  createUpdateProfileUseCase,
} from '../../apps/api-cryptoada/src/profile/profile.use-case.js';
import { createKeycloakIdentityAdmin } from '../../packages/identity-admin/src/create-keycloak-identity-admin.js';
import { createOwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../../packages/database/src/ownership/user-id.js';
import { USER_RESOLUTION_STATUS } from '../../packages/database/src/users/user-resolution.constant.js';
import { createApiHarness, type ApiHarness } from './api-harness.fixture.js';

import {
  FAKE_SERVICE_CLIENT_ID,
  FAKE_SERVICE_CLIENT_SECRET,
} from './fake-keycloak-admin.fixture.js';
import { startFakeKeycloak, type FakeKeycloak } from './fake-keycloak.fixture.js';
import {
  createInMemoryAccountStore,
  type InMemoryAccountStore,
} from './in-memory-account-store.fixture.js';
import {
  createInMemoryTelegramStore,
  type InMemoryTelegramStore,
} from './in-memory-telegram-store.fixture.js';
import { createInMemoryUserStore, type InMemoryUserStore } from './in-memory-user-store.fixture.js';
import { signTestToken } from './token-signing.fixture.js';

export const OWNER_A = {
  id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a01',
  subject: 'subject-owner-a',
  email: 'owner.a@example.test',
  chatId: '710001',
  displayName: 'Owner A Display',
} as const;
export const OWNER_B = {
  id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a02',
  subject: 'subject-owner-b',
  email: 'owner.b@example.test',
  chatId: '710002',
  displayName: 'Owner B Display',
} as const;
export const ADMIN_ACTOR_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9aff';
export const ADMIN_ACTOR_IP = '198.51.100.77';
export const OWNER_A_IP = '203.0.113.50';

const SECONDS_PER_MINUTE = 60;

export type AccountHarness = {
  readonly api: ApiHarness;
  readonly users: InMemoryUserStore;
  readonly telegram: InMemoryTelegramStore;
  readonly store: InMemoryAccountStore;
  readonly keycloak: FakeKeycloak;
  readonly events: string[];
  // Contas cujos sockets abertos foram fechados (T4.4): a exclusão derruba o tempo real da conta na hora.
  readonly closedSockets: string[];
  readonly tokenFor: (subject: string, authenticatedSecondsAgo?: number) => Promise<string>;
  readonly tokenWithoutAuthTime: (subject: string) => Promise<string>;
  readonly stop: () => Promise<void>;
};

function seedOwners(users: InMemoryUserStore, keycloak: FakeKeycloak): void {
  for (const owner of [OWNER_A, OWNER_B]) {
    const stored = users.seedUser({ id: owner.id, subject: owner.subject });
    stored.telegramChatId = owner.chatId;
    stored.displayName = owner.displayName;
    keycloak.admin.seedUser({ id: owner.subject, email: owner.email, credentialCount: 1 });
  }
}

export async function createAccountHarness(): Promise<AccountHarness> {
  const events: string[] = [];
  const closedSockets: string[] = [];
  const users = createInMemoryUserStore();
  const telegram = createInMemoryTelegramStore(users.users);
  const keycloak = startFakeKeycloak({
    issueAccessToken: () => Promise.reject(new Error('not used')),
    events,
  });
  seedOwners(users, keycloak);
  const store = createInMemoryAccountStore({
    users: users.users,
    linkCodes: telegram.linkCodes,
    events,
  });
  const identity = createKeycloakIdentityAdmin({
    adminApiUrl: keycloak.adminApiUrl,
    tokenUrl: keycloak.tokenUrl,
    clientId: FAKE_SERVICE_CLIENT_ID,
    clientSecret: FAKE_SERVICE_CLIENT_SECRET,
    now: () => Date.now(),
  });
  const idsBySubject: Record<string, string> = {
    [OWNER_A.subject]: OWNER_A.id,
    [OWNER_B.subject]: OWNER_B.id,
  };
  const api = await createApiHarness({
    resolveUser: (subject) => {
      const stored = [...users.users.values()].find((user) => user.keycloakSubject === subject);
      if (stored?.deletedAt !== undefined) {
        return Promise.resolve({ status: USER_RESOLUTION_STATUS.DELETED });
      }
      const userId = userIdFromDatabase(idsBySubject[subject] ?? OWNER_A.id);
      return Promise.resolve({
        status: USER_RESOLUTION_STATUS.ACTIVE,
        userId,
        scope: createOwnerScope(userId),
      });
    },
    routeFactory: () => [
      ...createAccountRoutes({
        exportAccount: createExportAccountUseCase({
          exports: store.exports,
          identity,
          now: () => Date.now(),
        }),
        deleteAccount: createDeleteAccountUseCase({
          deletions: store.deletions,
          audit: store.audit,
          identity,
          now: () => Date.now(),
          onAccountDeleted: (userId: string): void => void closedSockets.push(userId),
        }),
      }),
      ...createProfileRoutes({
        getProfile: createGetProfileUseCase(users.profiles),
        updateProfile: createUpdateProfileUseCase(users.profiles),
      }),
    ],
  });
  const nowSeconds = (): number => Math.floor(Date.now() / 1000);
  return {
    api,
    users,
    telegram,
    store,
    keycloak,
    events,
    closedSockets,
    tokenFor: (subject, authenticatedSecondsAgo = SECONDS_PER_MINUTE) =>
      signTestToken({
        key: api.key,
        claims: { sub: subject, auth_time: nowSeconds() - authenticatedSecondsAgo },
      }),
    tokenWithoutAuthTime: (subject) =>
      signTestToken({ key: api.key, claims: { sub: subject, auth_time: undefined } }),
    stop: async (): Promise<void> => {
      await api.stop();
      await keycloak.stop();
    },
  };
}
