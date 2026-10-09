// Copyright (c) 2026 Ada Technology. All rights reserved.
import { IdentityTestError } from './identity-test.error.js';

export type IdentityEnvironment = {
  readonly keycloakUrl: string;
  readonly mailpitUrl: string;
  readonly realmName: string;
  readonly adminUser: string;
  readonly adminPassword: string;
  readonly sessionClientSecret: string;
  readonly serviceClientSecret: string;
  readonly panelOrigin: string;
};

export const REALM_NAME = 'crypto-paper-trader';

function readRequired(name: string): string {
  const value = Bun.env[name];
  if (value === undefined || value.length === 0) {
    throw new IdentityTestError(`variável ${name} ausente; rode por make identity-test`);
  }
  return value;
}

export function readIdentityEnvironment(): IdentityEnvironment {
  return {
    keycloakUrl: `http://127.0.0.1:${readRequired('KEYCLOAK_PORT')}`,
    mailpitUrl: `http://127.0.0.1:${readRequired('MAILPIT_UI_PORT')}`,
    realmName: REALM_NAME,
    adminUser: readRequired('KEYCLOAK_ADMIN_USER'),
    adminPassword: readRequired('KEYCLOAK_ADMIN_PASSWORD'),
    sessionClientSecret: readRequired('KEYCLOAK_SESSION_CLIENT_SECRET'),
    serviceClientSecret: readRequired('KEYCLOAK_SERVICE_CLIENT_SECRET'),
    panelOrigin: readRequired('KEYCLOAK_PANEL_ORIGIN'),
  };
}
