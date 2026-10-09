// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAdminAccountRepository,
  createAuditEventRepository,
  type DatabaseHandle,
} from '@crypto/database';

import type { Environment } from '../environment.js';
import { createIdentityHttp } from '../identity-admin/identity-http.js';
import { createKeycloakAdminClient } from '../identity-admin/keycloak-admin-client.js';
import { createServiceAccountTokenProvider } from '../identity-admin/service-account-token.js';
import { createAdminAuditRecorder } from './admin-audit-recorder.js';
import type { AdminRouteDependencies } from './admin.routes.js';
import {
  createBlockAccountUseCase,
  createUnblockAccountUseCase,
} from './block-account.use-case.js';
import { createInviteUserUseCase } from './invite-user.use-case.js';
import { createListAccountsUseCase } from './list-accounts.use-case.js';

export type AdminEnvironment = Pick<
  Environment,
  | 'KEYCLOAK_TOKEN_URL'
  | 'KEYCLOAK_ADMIN_API_URL'
  | 'KEYCLOAK_SERVICE_CLIENT_ID'
  | 'KEYCLOAK_SERVICE_CLIENT_SECRET'
  | 'KEYCLOAK_SESSION_CLIENT_ID'
  | 'SESSION_ALLOWED_REDIRECT_URIS'
>;

export type CreateAdminRouteDependenciesParams = {
  readonly environment: AdminEnvironment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
};

export function createAdminRouteDependencies(
  params: CreateAdminRouteDependenciesParams,
): AdminRouteDependencies {
  const { environment, database, now } = params;
  const [invitationRedirectUri = ''] = environment.SESSION_ALLOWED_REDIRECT_URIS;
  const identity = createKeycloakAdminClient({
    http: createIdentityHttp({
      adminApiUrl: environment.KEYCLOAK_ADMIN_API_URL,
      tokens: createServiceAccountTokenProvider({
        tokenUrl: environment.KEYCLOAK_TOKEN_URL,
        clientId: environment.KEYCLOAK_SERVICE_CLIENT_ID,
        clientSecret: environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
        now,
      }),
    }),
    invitationClientId: environment.KEYCLOAK_SESSION_CLIENT_ID,
    invitationRedirectUri,
  });
  const accounts = createAdminAccountRepository(database);
  const audit = createAdminAuditRecorder(createAuditEventRepository(database));
  const accountState = { accounts, identity, audit };
  return {
    inviteUser: createInviteUserUseCase({ identity, accounts, audit }),
    listAccounts: createListAccountsUseCase({ accounts, identity }),
    blockAccount: createBlockAccountUseCase(accountState),
    unblockAccount: createUnblockAccountUseCase(accountState),
  };
}
