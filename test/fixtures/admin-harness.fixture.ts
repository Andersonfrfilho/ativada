// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAdminAuditRecorder } from '../../apps/api-cryptoada/src/admin/admin-audit-recorder.js';
import { createAdminRoutes } from '../../apps/api-cryptoada/src/admin/admin.routes.js';
import {
  createBlockAccountUseCase,
  createUnblockAccountUseCase,
} from '../../apps/api-cryptoada/src/admin/block-account.use-case.js';
import { createInviteUserUseCase } from '../../apps/api-cryptoada/src/admin/invite-user.use-case.js';
import { createListAccountsUseCase } from '../../apps/api-cryptoada/src/admin/list-accounts.use-case.js';
import { createIdentityHttp } from '../../packages/identity-admin/src/identity-http.js';
import { createKeycloakAdminClient } from '../../packages/identity-admin/src/keycloak-admin-client.js';
import { createServiceAccountTokenProvider } from '../../packages/identity-admin/src/service-account-token.js';
import { createProfileRoutes } from '../../apps/api-cryptoada/src/profile/profile.routes.js';
import {
  createGetProfileUseCase,
  createUpdateProfileUseCase,
} from '../../apps/api-cryptoada/src/profile/profile.use-case.js';
import { createHealthRoutes } from '../../apps/api-cryptoada/src/routes/health.routes.js';
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
  createInMemoryAdminStore,
  type InMemoryAdminStore,
} from './in-memory-admin-store.fixture.js';
import { createInMemoryUserStore, type InMemoryUserStore } from './in-memory-user-store.fixture.js';
import { signTestToken } from './token-signing.fixture.js';

export const ADMIN_SUBJECT = 'subject-admin-one';
export const OTHER_ADMIN_SUBJECT = 'subject-admin-two';
export const MEMBER_SUBJECT = 'subject-member-one';
export const OTHER_MEMBER_SUBJECT = 'subject-member-two';
export const PENDING_ACCOUNT_SUBJECT = 'subject-member-three';

export const ADMIN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e01';
export const OTHER_ADMIN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e02';
export const MEMBER_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e03';
export const OTHER_MEMBER_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e04';
export const UNKNOWN_ACCOUNT_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9eff';
export const REDIRECT_URI = 'http://panel.test/auth/callback';
export const SESSION_CLIENT = 'cryptoada-session';

const USER_ROLES: readonly string[] = ['user'];
const ADMIN_ROLES: readonly string[] = ['user', 'admin'];

export type AdminHarness = {
  readonly api: ApiHarness;
  readonly users: InMemoryUserStore;
  readonly store: InMemoryAdminStore;
  readonly keycloak: FakeKeycloak;
  readonly events: string[];
  readonly tokenFor: (subject: string, options?: TokenOptions) => Promise<string>;
  readonly stop: () => Promise<void>;
};

export type TokenOptions = {
  readonly roles?: readonly string[];
  readonly acr?: string;
};

const ACCOUNTS: readonly {
  readonly id: string;
  readonly subject: string;
  readonly email: string;
  readonly roles: readonly string[];
}[] = [
  { id: ADMIN_ID, subject: ADMIN_SUBJECT, email: 'admin.um@example.test', roles: ADMIN_ROLES },
  {
    id: OTHER_ADMIN_ID,
    subject: OTHER_ADMIN_SUBJECT,
    email: 'admin.dois@example.test',
    roles: ADMIN_ROLES,
  },
  { id: MEMBER_ID, subject: MEMBER_SUBJECT, email: 'membro.um@example.test', roles: USER_ROLES },
  {
    id: OTHER_MEMBER_ID,
    subject: OTHER_MEMBER_SUBJECT,
    email: 'membro.dois@example.test',
    roles: USER_ROLES,
  },
];

function seedAccounts(users: InMemoryUserStore, keycloak: FakeKeycloak): void {
  for (const [index, account] of ACCOUNTS.entries()) {
    users.seedUser({
      id: account.id,
      subject: account.subject,
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
    });
    keycloak.admin.seedUser({
      id: account.subject,
      email: account.email,
      roles: account.roles,
      credentialCount: 1,
    });
  }
}

export async function createAdminHarness(): Promise<AdminHarness> {
  const events: string[] = [];
  const users = createInMemoryUserStore();
  const store = createInMemoryAdminStore(users.users, events);
  const keycloak = startFakeKeycloak({
    issueAccessToken: () => Promise.reject(new Error('not used')),
    events,
  });
  seedAccounts(users, keycloak);
  const identity = createKeycloakAdminClient({
    http: createIdentityHttp({
      adminApiUrl: keycloak.adminApiUrl,
      tokens: createServiceAccountTokenProvider({
        tokenUrl: keycloak.tokenUrl,
        clientId: FAKE_SERVICE_CLIENT_ID,
        clientSecret: FAKE_SERVICE_CLIENT_SECRET,
        now: () => Date.now(),
      }),
    }),
    invitationClientId: SESSION_CLIENT,
    invitationRedirectUri: REDIRECT_URI,
  });
  const audit = createAdminAuditRecorder(store.audit);
  const accountState = { accounts: store.accounts, identity, audit };
  const subjectToUserId: Record<string, string> = Object.fromEntries(
    ACCOUNTS.map((account) => [account.subject, account.id]),
  );
  const api = await createApiHarness({
    userIdsBySubject: subjectToUserId,
    resolveUser: (subject) => {
      const stored = [...users.users.values()].find((user) => user.keycloakSubject === subject);
      if (stored?.deletedAt !== undefined)
        return Promise.resolve({ status: USER_RESOLUTION_STATUS.DELETED });
      if (stored?.blockedAt !== undefined)
        return Promise.resolve({ status: USER_RESOLUTION_STATUS.BLOCKED });
      const userId = userIdFromDatabase(subjectToUserId[subject] ?? ADMIN_ID);
      return Promise.resolve({
        status: USER_RESOLUTION_STATUS.ACTIVE,
        userId,
        scope: createOwnerScope(userId),
      });
    },
    routeFactory: () => [
      ...createAdminRoutes({
        inviteUser: createInviteUserUseCase({ identity, accounts: store.accounts, audit }),
        listAccounts: createListAccountsUseCase({ accounts: store.accounts, identity }),
        blockAccount: createBlockAccountUseCase(accountState),
        unblockAccount: createUnblockAccountUseCase(accountState),
      }),
      ...createHealthRoutes({ checkDatabase: () => Promise.resolve(true) }),
      ...createProfileRoutes({
        getProfile: createGetProfileUseCase(users.profiles),
        updateProfile: createUpdateProfileUseCase(users.profiles),
      }),
    ],
  });
  return {
    api,
    users,
    store,
    keycloak,
    events,
    tokenFor: (subject, options = {}) =>
      signTestToken({
        key: api.key,
        claims: {
          sub: subject,
          realm_access: { roles: options.roles ?? roleNamesOf(keycloak, subject) },
          acr:
            options.acr ??
            (keycloak.admin.users.get(subject)?.roles.includes('admin') ? '2' : 'password'),
        },
      }),
    stop: async (): Promise<void> => {
      await api.stop();
      await keycloak.stop();
    },
  };
}

function roleNamesOf(keycloak: FakeKeycloak, subject: string): readonly string[] {
  return keycloak.admin.users.get(subject)?.roles ?? USER_ROLES;
}
