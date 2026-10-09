// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityAdminClient } from './identity-admin.types.js';
import { createIdentityHttp } from './identity-http.js';
import { createKeycloakAdminClient } from './keycloak-admin-client.js';
import { createServiceAccountTokenProvider } from './service-account-token.js';

export type KeycloakIdentityAdminSettings = {
  readonly adminApiUrl: string;
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now: () => number;
  readonly invitationClientId?: string;
  readonly invitationRedirectUri?: string;
};

export function createKeycloakIdentityAdmin(
  settings: KeycloakIdentityAdminSettings,
): IdentityAdminClient {
  return createKeycloakAdminClient({
    http: createIdentityHttp({
      adminApiUrl: settings.adminApiUrl,
      tokens: createServiceAccountTokenProvider({
        tokenUrl: settings.tokenUrl,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        now: settings.now,
      }),
    }),
    ...(settings.invitationClientId === undefined
      ? {}
      : { invitationClientId: settings.invitationClientId }),
    ...(settings.invitationRedirectUri === undefined
      ? {}
      : { invitationRedirectUri: settings.invitationRedirectUri }),
  });
}
