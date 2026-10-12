// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const REALM_FILE = 'realm/ativada-realm.json';
const REALM_NAME = 'ativada';
const SERVICE_CLIENT_ID = 'ativada-api-service';
const PLACEHOLDER_PATTERN = /\$\{([A-Z0-9_]+)\}/g;
const REQUIRED_EVENT_TYPES: readonly string[] = [
  'LOGIN',
  'LOGIN_ERROR',
  'UPDATE_PASSWORD',
  'UPDATE_TOTP',
  'REMOVE_TOTP',
  'CODE_TO_TOKEN_ERROR',
  'REFRESH_TOKEN_ERROR',
  'LOGOUT',
];
const NOTIFIED_EVENT_TYPES: readonly string[] = ['UPDATE_PASSWORD', 'UPDATE_TOTP', 'REMOVE_TOTP'];
const EVENT_RETENTION_SECONDS = 7_776_000;
const SECRET_ENVIRONMENT_KEYS: readonly string[] = [
  'KEYCLOAK_ADMIN_PASSWORD',
  'KEYCLOAK_SESSION_CLIENT_SECRET',
  'KEYCLOAK_SERVICE_CLIENT_SECRET',
];

type ProtocolMapper = {
  readonly protocolMapper?: string;
  readonly config?: Readonly<Record<string, string>>;
};

type RealmClient = {
  readonly clientId: string;
  readonly publicClient?: boolean;
  readonly bearerOnly?: boolean;
  readonly secret?: string;
  readonly standardFlowEnabled?: boolean;
  readonly implicitFlowEnabled?: boolean;
  readonly directAccessGrantsEnabled?: boolean;
  readonly serviceAccountsEnabled?: boolean;
  readonly fullScopeAllowed?: boolean;
  readonly redirectUris?: readonly string[];
  readonly webOrigins?: readonly string[];
  readonly defaultClientScopes?: readonly string[];
  readonly optionalClientScopes?: readonly string[];
  readonly attributes?: Readonly<Record<string, string>>;
  readonly protocolMappers?: readonly ProtocolMapper[];
  readonly authorizationSettings?: {
    readonly policies?: readonly AuthorizationPolicy[];
    readonly resources?: readonly { readonly name: string; readonly type: string }[];
  };
};

type AuthorizationPolicy = {
  readonly name: string;
  readonly type: string;
  readonly logic?: string;
  readonly config?: Readonly<Record<string, string>>;
};

type FlowExecution = {
  readonly authenticator?: string;
  readonly flowAlias?: string;
  readonly requirement: string;
  readonly authenticatorConfig?: string;
};

type AuthenticationFlow = {
  readonly alias: string;
  readonly topLevel: boolean;
  readonly authenticationExecutions: readonly FlowExecution[];
};

type RealmRepresentation = {
  readonly realm: string;
  readonly enabled: boolean;
  readonly registrationAllowed: boolean;
  readonly verifyEmail: boolean;
  readonly resetPasswordAllowed: boolean;
  readonly loginWithEmailAllowed: boolean;
  readonly duplicateEmailsAllowed: boolean;
  readonly editUsernameAllowed: boolean;
  readonly rememberMe: boolean;
  readonly sslRequired: string;
  readonly accessTokenLifespan: number;
  readonly revokeRefreshToken: boolean;
  readonly refreshTokenMaxReuse: number;
  readonly actionTokenGeneratedByAdminLifespan: number;
  readonly passwordPolicy: string;
  readonly bruteForceProtected: boolean;
  readonly permanentLockout: boolean;
  readonly failureFactor: number;
  readonly waitIncrementSeconds: number;
  readonly maxFailureWaitSeconds: number;
  readonly maxDeltaTimeSeconds: number;
  readonly otpPolicyType: string;
  readonly otpPolicyAlgorithm: string;
  readonly otpPolicyDigits: number;
  readonly otpPolicyPeriod: number;
  readonly otpPolicyLookAheadWindow: number;
  readonly adminPermissionsEnabled: boolean;
  readonly eventsEnabled?: boolean;
  readonly eventsExpiration?: number;
  readonly enabledEventTypes?: readonly string[];
  readonly eventsListeners?: readonly string[];
  readonly adminEventsEnabled?: boolean;
  readonly adminEventsDetailsEnabled?: boolean;
  readonly groups?: readonly {
    readonly id?: string;
    readonly name: string;
    readonly realmRoles?: readonly string[];
  }[];
  readonly scopeMappings?: readonly { readonly client: string }[];
  readonly browserFlow: string;
  readonly browserSecurityHeaders: Readonly<Record<string, string>>;
  readonly smtpServer: Readonly<Record<string, string>>;
  readonly attributes: Readonly<Record<string, string>>;
  readonly roles: {
    readonly realm: readonly {
      readonly name: string;
      readonly composites?: { readonly realm?: readonly string[] };
    }[];
  };
  readonly clients: readonly RealmClient[];
  readonly authenticationFlows: readonly AuthenticationFlow[];
  readonly authenticatorConfig: readonly {
    readonly alias: string;
    readonly config: Readonly<Record<string, string>>;
  }[];
  readonly requiredActions: readonly { readonly alias: string; readonly enabled: boolean }[];
};

async function readRepositoryText(relativePath: string): Promise<string> {
  return Bun.file(`${REPOSITORY_ROOT}${relativePath}`).text();
}

async function readRealm(): Promise<RealmRepresentation> {
  return JSON.parse(await readRepositoryText(REALM_FILE)) as RealmRepresentation;
}

function findClient(realm: RealmRepresentation, clientId: string): RealmClient {
  const client = realm.clients.find((candidate) => candidate.clientId === clientId);
  if (client === undefined) throw new Error(`cliente ${clientId} ausente do realm`);
  return client;
}

function findFlow(realm: RealmRepresentation, alias: string): AuthenticationFlow {
  const flow = realm.authenticationFlows.find((candidate) => candidate.alias === alias);
  if (flow === undefined) throw new Error(`fluxo ${alias} ausente do realm`);
  return flow;
}

function collectAuthenticators(
  realm: RealmRepresentation,
  flowAlias: string,
): readonly FlowExecution[] {
  const executions = findFlow(realm, flowAlias).authenticationExecutions;
  return executions.flatMap((execution) =>
    execution.flowAlias === undefined
      ? [execution]
      : [execution, ...collectAuthenticators(realm, execution.flowAlias)],
  );
}

function findLevelOfAuthentication(
  realm: RealmRepresentation,
  subflowAlias: string,
): string | undefined {
  const condition = findFlow(realm, subflowAlias).authenticationExecutions.find(
    (execution) => execution.authenticator === 'conditional-level-of-authentication',
  );
  const config = realm.authenticatorConfig.find(
    (entry) => entry.alias === condition?.authenticatorConfig,
  );
  return config?.config['loa-condition-level'];
}

function parseEnvironmentFile(content: string): Readonly<Record<string, string>> {
  const entries: [string, string][] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    entries.push([line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]);
  }
  return Object.fromEntries(entries);
}

describe('realm: conta e sessão', () => {
  test('is the ativada realm, enabled, with TLS required off loopback', async () => {
    const realm = await readRealm();
    expect(realm.realm).toBe(REALM_NAME);
    expect(realm.enabled).toBe(true);
    expect(realm.sslRequired).toBe('external');
  });

  test('has self registration off and e-mail verification on', async () => {
    const realm = await readRealm();
    expect(realm.registrationAllowed).toBe(false);
    expect(realm.verifyEmail).toBe(true);
    expect(realm.resetPasswordAllowed).toBe(true);
    expect(realm.loginWithEmailAllowed).toBe(true);
    expect(realm.duplicateEmailsAllowed).toBe(false);
    expect(realm.editUsernameAllowed).toBe(false);
    expect(realm.rememberMe).toBe(false);
  });

  test('issues 5 minute access tokens and rotating refresh tokens without reuse', async () => {
    const realm = await readRealm();
    expect(realm.accessTokenLifespan).toBe(300);
    expect(realm.revokeRefreshToken).toBe(true);
    expect(realm.refreshTokenMaxReuse).toBe(0);
  });

  test('makes invitation and action links valid for 24 hours', async () => {
    const realm = await readRealm();
    expect(realm.actionTokenGeneratedByAdminLifespan).toBe(86400);
  });

  test('enforces the 12 to 128 character password policy with history of 5', async () => {
    const realm = await readRealm();
    expect(realm.passwordPolicy).toBe(
      'length(12) and maxLength(128) and notUsername and notEmail and passwordHistory(5)',
    );
  });

  test('protects against brute force with temporary lockout', async () => {
    const realm = await readRealm();
    expect(realm.bruteForceProtected).toBe(true);
    expect(realm.permanentLockout).toBe(false);
    expect(realm.failureFactor).toBe(5);
    expect(realm.waitIncrementSeconds).toBe(60);
    expect(realm.maxFailureWaitSeconds).toBe(900);
    expect(realm.maxDeltaTimeSeconds).toBe(43200);
  });

  test('sends mail through the mailpit service', async () => {
    const realm = await readRealm();
    expect(realm.smtpServer['host']).toBe('mailpit');
    expect(realm.smtpServer['port']).toBe('1025');
  });

  test('sets frame and referrer protection headers', async () => {
    const realm = await readRealm();
    const headers = realm.browserSecurityHeaders;
    expect(headers['xFrameOptions']).toBe('DENY');
    expect(headers['contentSecurityPolicy']).toContain("frame-ancestors 'self'");
    expect(headers['xContentTypeOptions']).toBe('nosniff');
    expect(headers['referrerPolicy']).toBe('no-referrer');
    expect(headers['strictTransportSecurity']).toContain('max-age=');
  });
});

describe('realm: papéis e segundo fator', () => {
  test('defines the user and admin realm roles', async () => {
    const realm = await readRealm();
    const roleNames = realm.roles.realm.map((role) => role.name);
    expect(roleNames).toContain('user');
    expect(roleNames).toContain('admin');
  });

  test('gives only user by default, never admin or offline_access', async () => {
    const realm = await readRealm();
    const defaultRole = realm.roles.realm.find((role) => role.name === 'default-roles-ativada');
    expect(defaultRole?.composites?.realm).toEqual(['user']);
  });

  test('uses TOTP with HmacSHA1, 6 digits, 30 seconds and a window of 1', async () => {
    const realm = await readRealm();
    expect(realm.otpPolicyType).toBe('totp');
    expect(realm.otpPolicyAlgorithm).toBe('HmacSHA1');
    expect(realm.otpPolicyDigits).toBe(6);
    expect(realm.otpPolicyPeriod).toBe(30);
    expect(realm.otpPolicyLookAheadWindow).toBe(1);
  });

  test('keeps the CONFIGURE_TOTP required action enabled', async () => {
    const realm = await readRealm();
    const action = realm.requiredActions.find((entry) => entry.alias === 'CONFIGURE_TOTP');
    expect(action?.enabled).toBe(true);
  });

  test('binds the browser flow to browser-loa and maps acr to levels', async () => {
    const realm = await readRealm();
    expect(realm.browserFlow).toBe('browser-loa');
    expect(findFlow(realm, 'browser-loa').topLevel).toBe(true);
    expect(JSON.parse(realm.attributes['acr.loa.map'] ?? '{}')).toEqual({ password: 1, mfa: 2 });
  });

  test('LoA 1 is the password form and LoA 2 is the OTP form', async () => {
    const realm = await readRealm();
    const levelOne = collectAuthenticators(realm, 'browser-loa-level-1');
    const levelTwo = collectAuthenticators(realm, 'browser-loa-level-2');
    expect(findLevelOfAuthentication(realm, 'browser-loa-level-1')).toBe('1');
    expect(findLevelOfAuthentication(realm, 'browser-loa-level-2')).toBe('2');
    expect(levelOne.map((entry) => entry.authenticator)).toContain('auth-username-password-form');
    expect(levelTwo.map((entry) => entry.authenticator)).toContain('auth-otp-form');
    expect(levelOne.map((entry) => entry.authenticator)).not.toContain('auth-otp-form');
  });

  test('every level subflow of browser-loa is conditional and reachable', async () => {
    const realm = await readRealm();
    const reachable = collectAuthenticators(realm, 'browser-loa').map((entry) => entry.flowAlias);
    for (const alias of ['browser-loa-level-1', 'browser-loa-level-2']) {
      const parent = findFlow(realm, 'browser-loa-forms').authenticationExecutions.find(
        (entry) => entry.flowAlias === alias,
      );
      expect(reachable).toContain(alias);
      expect(parent?.requirement).toBe('CONDITIONAL');
    }
  });

  test('the OTP form of LoA 2 is REQUIRED, so the second factor cannot be skipped', async () => {
    const realm = await readRealm();
    const otpForm = findFlow(realm, 'browser-loa-level-2').authenticationExecutions.find(
      (entry) => entry.authenticator === 'auth-otp-form',
    );
    expect(otpForm?.requirement).toBe('REQUIRED');
    const everyAuthenticator = realm.authenticationFlows
      .filter((flow) => flow.alias.startsWith('browser-loa'))
      .flatMap((flow) => flow.authenticationExecutions);
    const otpForms = everyAuthenticator.filter((entry) => entry.authenticator === 'auth-otp-form');
    expect(otpForms.length).toBe(1);
  });
});

describe('realm: clientes', () => {
  test('crypto-panel does not exist: the token handler uses ativada-session', async () => {
    const realm = await readRealm();
    expect(realm.clients.map((client) => client.clientId)).not.toContain('crypto-panel');
    expect(realm.scopeMappings?.map((mapping) => mapping.client)).not.toContain('crypto-panel');
  });

  test('admin-cli has no password grant, so a password alone never mints a token', async () => {
    const client = findClient(await readRealm(), 'admin-cli');
    expect(client.directAccessGrantsEnabled).toBe(false);
    expect(client.standardFlowEnabled).toBe(false);
    expect(client.serviceAccountsEnabled).toBe(false);
  });

  test('no client of the realm enables the direct access (password) grant', async () => {
    for (const client of (await readRealm()).clients) {
      expect(client.directAccessGrantsEnabled ?? false).toBe(false);
    }
  });

  test('ativada-api only serves as audience, with every flow off', async () => {
    const client = findClient(await readRealm(), 'ativada-api');
    expect(client.bearerOnly).toBe(true);
    expect(client.standardFlowEnabled).toBe(false);
    expect(client.implicitFlowEnabled).toBe(false);
    expect(client.directAccessGrantsEnabled).toBe(false);
    expect(client.serviceAccountsEnabled).toBe(false);
  });

  test('ativada-session is confidential, standard flow with PKCE S256 and a secret', async () => {
    const client = findClient(await readRealm(), 'ativada-session');
    expect(client.publicClient).toBe(false);
    expect(client.standardFlowEnabled).toBe(true);
    expect(client.implicitFlowEnabled).toBe(false);
    expect(client.directAccessGrantsEnabled).toBe(false);
    expect(client.serviceAccountsEnabled).toBe(false);
    expect(client.attributes?.['pkce.code.challenge.method']).toBe('S256');
    expect(client.secret).toBe('${KEYCLOAK_SESSION_CLIENT_SECRET}');
  });

  test('ativada-api-service is confidential and only a service account', async () => {
    const client = findClient(await readRealm(), SERVICE_CLIENT_ID);
    expect(client.publicClient).toBe(false);
    expect(client.serviceAccountsEnabled).toBe(true);
    expect(client.standardFlowEnabled).toBe(false);
    expect(client.implicitFlowEnabled).toBe(false);
    expect(client.directAccessGrantsEnabled).toBe(false);
    expect(client.secret).toBe('${KEYCLOAK_SERVICE_CLIENT_SECRET}');
  });

  test.each(['ativada-session'])(
    '%s adds ativada-api to the access token audience',
    async (clientId) => {
      const client = findClient(await readRealm(), clientId);
      const audienceMapper = client.protocolMappers?.find(
        (mapper) => mapper.protocolMapper === 'oidc-audience-mapper',
      );
      expect(audienceMapper?.config?.['included.client.audience']).toBe('ativada-api');
      expect(audienceMapper?.config?.['access.token.claim']).toBe('true');
    },
  );

  test('no client reaches offline_access and none has full scope', async () => {
    const realm = await readRealm();
    for (const client of realm.clients) {
      const scopes = [
        ...(client.defaultClientScopes ?? []),
        ...(client.optionalClientScopes ?? []),
      ];
      expect(scopes).not.toContain('offline_access');
      if (client.clientId !== 'admin-permissions') expect(client.fullScopeAllowed).toBe(false);
    }
  });

  test('redirect URIs and web origins are enumerated, never a wildcard', async () => {
    const realm = await readRealm();
    for (const client of realm.clients) {
      for (const uri of [...(client.redirectUris ?? []), ...(client.webOrigins ?? [])]) {
        expect(uri.includes('*')).toBe(false);
      }
    }
  });
});

describe('realm: eventos e aviso ao titular', () => {
  test('records the security events for a fixed number of days', async () => {
    const realm = await readRealm();
    expect(realm.eventsEnabled).toBe(true);
    expect(realm.eventsExpiration).toBe(EVENT_RETENTION_SECONDS);
    for (const eventType of REQUIRED_EVENT_TYPES) {
      expect(realm.enabledEventTypes).toContain(eventType);
    }
  });

  test('records admin events without the representation (it would carry the e-mail)', async () => {
    const realm = await readRealm();
    expect(realm.adminEventsEnabled).toBe(true);
    expect(realm.adminEventsDetailsEnabled).toBe(false);
  });

  test('sends the e-mail listener alongside the jboss-logging one', async () => {
    const realm = await readRealm();
    expect(realm.eventsListeners).toContain('email');
    expect(realm.eventsListeners).toContain('jboss-logging');
  });

  test('the compose limits the e-mail listener to password and TOTP changes', async () => {
    const compose = await readRepositoryText('compose.yaml');
    const included = /--spi-events-listener--email--include-events=([A-Z_,]+)/.exec(compose);
    expect(included?.[1]?.split(',').sort()).toEqual([...NOTIFIED_EVENT_TYPES].sort());
  });
});

describe('realm: permissões finas da service account', () => {
  test('enables fine-grained admin permissions', async () => {
    expect((await readRealm()).adminPermissionsEnabled).toBe(true);
  });

  test('grants ativada-api-service only manage and view on Users, never map-roles', async () => {
    const realm = await readRealm();
    const settings = findClient(realm, 'admin-permissions').authorizationSettings;
    const permission = settings?.policies?.find((policy) => policy.type === 'scope');
    const clientPolicy = settings?.policies?.find((policy) => policy.type === 'client');
    expect(JSON.parse(clientPolicy?.config?.['clients'] ?? '[]')).toEqual([SERVICE_CLIENT_ID]);
    expect(permission?.config?.['defaultResourceType']).toBe('Users');
    expect(JSON.parse(permission?.config?.['scopes'] ?? '[]')).toEqual(['manage', 'view']);
  });

  test('the admin role is held through the admins group', async () => {
    const group = (await readRealm()).groups?.find((candidate) => candidate.name === 'admins');
    expect(group?.realmRoles).toEqual(['admin']);
    expect(group?.id).toBeDefined();
  });

  test('denies ativada-api-service manage on the admins group members (FGAP v2, unanimous)', async () => {
    const realm = await readRealm();
    const groupId = realm.groups?.find((candidate) => candidate.name === 'admins')?.id;
    const settings = findClient(realm, 'admin-permissions').authorizationSettings;
    const denial = settings?.policies?.find(
      (policy) => policy.name === 'ativada-api-service-cannot-manage-admins',
    );
    const negation = settings?.policies?.find(
      (policy) => policy.name === 'not-ativada-api-service-policy',
    );
    expect(negation?.logic).toBe('NEGATIVE');
    expect(JSON.parse(negation?.config?.['clients'] ?? '[]')).toEqual([SERVICE_CLIENT_ID]);
    expect(JSON.parse(denial?.config?.['resources'] ?? '[]')).toEqual([groupId]);
    expect(denial?.config?.['defaultResourceType']).toBe('Groups');
    expect((JSON.parse(denial?.config?.['scopes'] ?? '[]') as string[]).sort()).toEqual([
      'manage',
      'manage-members',
    ]);
    expect(JSON.parse(denial?.config?.['applyPolicies'] ?? '[]')).toEqual([negation?.name]);
    expect(settings?.resources?.map((resource) => resource.name)).toContain(groupId);
  });

  test('keeps the unanimous decision strategy that makes the denial win', async () => {
    const settings = findClient(await readRealm(), 'admin-permissions').authorizationSettings;
    expect((settings as { decisionStrategy?: string } | undefined)?.decisionStrategy).toBe(
      'UNANIMOUS',
    );
  });

  test('gives the service account no realm-management role', async () => {
    const serialized = await readRepositoryText(REALM_FILE);
    expect(serialized).not.toContain('manage-users');
    expect(serialized).not.toContain('realm-admin');
    expect(serialized).not.toContain('impersonation');
  });
});

describe('realm: segredos', () => {
  test('contains none of the development secret values', async () => {
    const serialized = await readRepositoryText(REALM_FILE);
    for (const fileName of ['env.dev', 'env.test']) {
      const values = parseEnvironmentFile(await readRepositoryText(`envs/${fileName}`));
      for (const key of SECRET_ENVIRONMENT_KEYS) {
        const secretValue = values[key];
        expect(secretValue === undefined || secretValue.length < 8).toBe(false);
        expect(serialized.includes(secretValue ?? '')).toBe(false);
      }
    }
  });

  test('declares every placeholder in both env files and in the keycloak service', async () => {
    const serialized = await readRepositoryText(REALM_FILE);
    const placeholders = [...serialized.matchAll(PLACEHOLDER_PATTERN)].map(
      (match) => match[1] ?? '',
    );
    const compose = await readRepositoryText('compose.yaml');
    expect(placeholders.length).toBeGreaterThan(0);
    for (const fileName of ['env.dev', 'env.test']) {
      const values = parseEnvironmentFile(await readRepositoryText(`envs/${fileName}`));
      for (const placeholder of placeholders) {
        expect(values[placeholder]).toBeDefined();
        expect(compose).toContain(`${placeholder}:`);
      }
    }
  });

  test('differs between dev and test secrets', async () => {
    const devValues = parseEnvironmentFile(await readRepositoryText('envs/env.dev'));
    const testValues = parseEnvironmentFile(await readRepositoryText('envs/env.test'));
    for (const key of SECRET_ENVIRONMENT_KEYS) {
      expect(devValues[key]).not.toBe(testValues[key]);
    }
  });
});
