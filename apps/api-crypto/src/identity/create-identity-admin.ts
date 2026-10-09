// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createKeycloakIdentityAdmin, type IdentityAdminClient } from '@crypto/identity-admin';

import type { Environment } from '../environment.js';

export type IdentityAdminEnvironment = Pick<
  Environment,
  | 'KEYCLOAK_TOKEN_URL'
  | 'KEYCLOAK_ADMIN_API_URL'
  | 'KEYCLOAK_SERVICE_CLIENT_ID'
  | 'KEYCLOAK_SERVICE_CLIENT_SECRET'
  | 'KEYCLOAK_SESSION_CLIENT_ID'
  | 'SESSION_ALLOWED_REDIRECT_URIS'
>;

export type CreateIdentityAdminParams = {
  readonly environment: IdentityAdminEnvironment;
  readonly now: () => number;
};

export function createIdentityAdmin(params: CreateIdentityAdminParams): IdentityAdminClient {
  const { environment, now } = params;
  const [invitationRedirectUri = ''] = environment.SESSION_ALLOWED_REDIRECT_URIS;
  return createKeycloakIdentityAdmin({
    adminApiUrl: environment.KEYCLOAK_ADMIN_API_URL,
    tokenUrl: environment.KEYCLOAK_TOKEN_URL,
    clientId: environment.KEYCLOAK_SERVICE_CLIENT_ID,
    clientSecret: environment.KEYCLOAK_SERVICE_CLIENT_SECRET,
    now,
    invitationClientId: environment.KEYCLOAK_SESSION_CLIENT_ID,
    invitationRedirectUri,
  });
}
