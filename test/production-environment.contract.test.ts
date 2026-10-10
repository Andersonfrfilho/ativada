// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema as apiEnvironmentSchema } from '../apps/api-cryptoada/src/environment.js';
import { environmentSchema as cronEnvironmentSchema } from '../apps/cron-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const STRONG_SECRET = 'S'.repeat(40);
const REPEATED_SECRET_FRAGMENT = 'ValorSecretoQueNaoPodeVazar';

type EnvironmentSource = Record<string, string>;

async function buildProductionEnvironment(): Promise<EnvironmentSource> {
  const base = await readEnvironmentFile('env.test');
  const origin = 'https://auth.crypto.example.com';
  const realm = `${origin}/realms/cryptoada`;
  return {
    ...base,
    ENV: 'production',
    DATABASE_URL:
      'postgres://cryptoada:prod-password-0123456789@db.internal:5432/crypto?sslmode=require',
    KEYCLOAK_ISSUER: realm,
    KEYCLOAK_JWKS_URL: `${realm}/protocol/openid-connect/certs`,
    KEYCLOAK_TOKEN_URL: `${realm}/protocol/openid-connect/token`,
    KEYCLOAK_LOGOUT_URL: `${realm}/protocol/openid-connect/logout`,
    KEYCLOAK_ADMIN_API_URL: `${origin}/admin/realms/cryptoada`,
    KEYCLOAK_SESSION_CLIENT_SECRET: STRONG_SECRET,
    KEYCLOAK_SERVICE_CLIENT_SECRET: STRONG_SECRET,
    SESSION_ALLOWED_REDIRECT_URIS: 'https://app.crypto.example.com/auth/callback',
    CORS_ALLOWED_ORIGINS: 'https://app.crypto.example.com',
    TRUSTED_PROXY_HOPS: '1',
    TELEGRAM_BOT_TOKEN: `123456789:${'T'.repeat(40)}`,
    TELEGRAM_WEBHOOK_SECRET: 'W'.repeat(40),
    TELEGRAM_API_BASE_URL: 'https://api.telegram.org',
  };
}

function issuesOf(
  schema: Parameters<typeof parseEnvironment>[0],
  source: EnvironmentSource,
): string {
  try {
    parseEnvironment(schema, source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.message;
    throw error;
  }
  return '';
}

describe('api-cryptoada in production', () => {
  test('accepts a fully explicit production configuration', async () => {
    const environment = parseEnvironment(apiEnvironmentSchema, await buildProductionEnvironment());
    expect(environment.TRUSTED_PROXY_HOPS).toBe(1);
  });

  test('requires TRUSTED_PROXY_HOPS to be set, with no default', async () => {
    const source = await buildProductionEnvironment();
    delete source['TRUSTED_PROXY_HOPS'];
    expect(issuesOf(apiEnvironmentSchema, source)).toContain('TRUSTED_PROXY_HOPS: obrigatória');
  });

  test.each([
    'KEYCLOAK_ISSUER',
    'KEYCLOAK_JWKS_URL',
    'KEYCLOAK_TOKEN_URL',
    'KEYCLOAK_LOGOUT_URL',
    'KEYCLOAK_ADMIN_API_URL',
    'TELEGRAM_API_BASE_URL',
    'SESSION_ALLOWED_REDIRECT_URIS',
    'CORS_ALLOWED_ORIGINS',
  ])('rejects a plain http:// %s', async (variable) => {
    const source = await buildProductionEnvironment();
    source[variable] =
      variable === 'CORS_ALLOWED_ORIGINS'
        ? 'http://insecure.example.com'
        : `http://insecure.example.com/${REPEATED_SECRET_FRAGMENT}`;
    const message = issuesOf(apiEnvironmentSchema, source);
    expect(message).toContain(variable);
    expect(message).not.toContain(REPEATED_SECRET_FRAGMENT);
  });

  test.each([
    ['without sslmode', 'postgres://cryptoada:prod-password-0123456789@db.internal:5432/crypto'],
    [
      'with sslmode=disable',
      'postgres://cryptoada:prod-password-0123456789@db.internal:5432/crypto?sslmode=disable',
    ],
  ])('rejects DATABASE_URL %s', async (_name, value) => {
    const source = await buildProductionEnvironment();
    source['DATABASE_URL'] = value;
    const message = issuesOf(apiEnvironmentSchema, source);
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('prod-password-0123456789');
  });

  test.each([
    'KEYCLOAK_SESSION_CLIENT_SECRET',
    'KEYCLOAK_SERVICE_CLIENT_SECRET',
    'TELEGRAM_WEBHOOK_SECRET',
  ])('rejects a %s shorter than 32 characters', async (variable) => {
    const source = await buildProductionEnvironment();
    source[variable] = 'curto_demais_0123456789';
    const message = issuesOf(apiEnvironmentSchema, source);
    expect(message).toContain(variable);
    expect(message).not.toContain('curto_demais_0123456789');
  });

  test('rejects any value that keeps a development marker', async () => {
    const source = await buildProductionEnvironment();
    source['KEYCLOAK_SESSION_CLIENT_SECRET'] = `${'a'.repeat(40)}_dev_only`;
    const message = issuesOf(apiEnvironmentSchema, source);
    expect(message).toContain('KEYCLOAK_SESSION_CLIENT_SECRET');
    expect(message).not.toContain('a'.repeat(40));
  });

  test('reports every violation at once', async () => {
    const source = await buildProductionEnvironment();
    source['KEYCLOAK_ISSUER'] = 'http://insecure.example.com';
    source['DATABASE_URL'] = 'postgres://u:p@h:5432/d';
    delete source['TRUSTED_PROXY_HOPS'];
    const message = issuesOf(apiEnvironmentSchema, source);
    for (const variable of ['KEYCLOAK_ISSUER', 'DATABASE_URL', 'TRUSTED_PROXY_HOPS']) {
      expect(message).toContain(variable);
    }
  });

  test.each(['env.dev', 'env.test'])(
    '%s keeps working without any production rule',
    async (file) => {
      const source = await readEnvironmentFile(file);
      expect(issuesOf(apiEnvironmentSchema, source)).toBe('');
    },
  );
});

describe('cron-cryptoada in production', () => {
  async function buildCronProductionEnvironment(): Promise<EnvironmentSource> {
    return buildProductionEnvironment();
  }

  test('accepts a fully explicit production configuration', async () => {
    expect(issuesOf(cronEnvironmentSchema, await buildCronProductionEnvironment())).toBe('');
  });

  test.each(['KEYCLOAK_TOKEN_URL', 'KEYCLOAK_ADMIN_API_URL'])(
    'rejects a plain http:// %s',
    async (variable) => {
      const source = await buildCronProductionEnvironment();
      source[variable] = 'http://insecure.example.com';
      expect(issuesOf(cronEnvironmentSchema, source)).toContain(variable);
    },
  );

  test('rejects DATABASE_URL without sslmode', async () => {
    const source = await buildCronProductionEnvironment();
    source['DATABASE_URL'] = 'postgres://u:p@h:5432/d';
    expect(issuesOf(cronEnvironmentSchema, source)).toContain('DATABASE_URL');
  });

  test('rejects a short service secret and a development marker', async () => {
    const source = await buildCronProductionEnvironment();
    source['KEYCLOAK_SERVICE_CLIENT_SECRET'] = 'curto';
    expect(issuesOf(cronEnvironmentSchema, source)).toContain('KEYCLOAK_SERVICE_CLIENT_SECRET');
    source['KEYCLOAK_SERVICE_CLIENT_SECRET'] = `${'b'.repeat(40)}_dev_only`;
    expect(issuesOf(cronEnvironmentSchema, source)).toContain('KEYCLOAK_SERVICE_CLIENT_SECRET');
  });

  test('dev and test environments are unchanged', async () => {
    expect(issuesOf(cronEnvironmentSchema, await readEnvironmentFile('env.test'))).toBe('');
  });
});
