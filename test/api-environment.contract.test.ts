// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { environmentSchema } from '../apps/api-ativada/src/environment.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const AUTHENTICATION_VARIABLES: readonly string[] = [
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_JWKS_URL',
  'API_AUDIENCE',
  'AUTHORIZED_PARTIES',
  'CORS_ALLOWED_ORIGINS',
];

const SESSION_VARIABLES: readonly string[] = [
  'KEYCLOAK_TOKEN_URL',
  'KEYCLOAK_LOGOUT_URL',
  'KEYCLOAK_SESSION_CLIENT_ID',
  'KEYCLOAK_SESSION_CLIENT_SECRET',
  'SESSION_ALLOWED_REDIRECT_URIS',
];

const IDENTITY_ADMIN_VARIABLES: readonly string[] = [
  'KEYCLOAK_ADMIN_API_URL',
  'KEYCLOAK_SERVICE_CLIENT_ID',
  'KEYCLOAK_SERVICE_CLIENT_SECRET',
];

describe('api-ativada environment (authentication, CORS and proxies)', () => {
  test.each(['env.dev', 'env.test'])('%s satisfies the schema', async (fileName) => {
    const environment = parseEnvironment(environmentSchema, await readEnvironmentFile(fileName));
    expect(environment.API_AUDIENCE).toBe('ativada-api');
    expect(environment.AUTHORIZED_PARTIES).toStrictEqual(['ativada-session']);
    expect(environment.CORS_ALLOWED_ORIGINS.length).toBeGreaterThan(0);
    expect(environment.TRUSTED_PROXY_HOPS).toBe(0);
    expect(environment.KEYCLOAK_ISSUER.endsWith('/realms/ativada')).toBe(true);
    expect(environment.KEYCLOAK_JWKS_URL.endsWith('/protocol/openid-connect/certs')).toBe(true);
  });

  test('fails at boot naming every missing authentication variable', async () => {
    const base = await readEnvironmentFile('env.test');
    for (const variable of AUTHENTICATION_VARIABLES) delete base[variable];
    const error = ((): unknown => {
      try {
        parseEnvironment(environmentSchema, base);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(EnvironmentError);
    const issues = (error as EnvironmentError).issues.join('\n');
    for (const variable of AUTHENTICATION_VARIABLES) expect(issues).toContain(variable);
  });

  test('parses comma separated lists, trimming spaces and ignoring empty items', async () => {
    const base = await readEnvironmentFile('env.test');
    const environment = parseEnvironment(environmentSchema, {
      ...base,
      AUTHORIZED_PARTIES: 'ativada-session, crypto-other,',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com , http://127.0.0.1:56100',
    });
    expect(environment.AUTHORIZED_PARTIES).toStrictEqual(['ativada-session', 'crypto-other']);
    expect(environment.CORS_ALLOWED_ORIGINS).toStrictEqual([
      'https://app.example.com',
      'http://127.0.0.1:56100',
    ]);
  });

  test.each([
    ['wildcard', '*'],
    ['origin with a path', 'https://app.example.com/panel'],
    ['origin with a trailing slash', 'https://app.example.com/'],
    ['not a URL', 'app.example.com'],
    ['empty list', ' , '],
  ])('rejects CORS_ALLOWED_ORIGINS with %s', async (_name, value) => {
    const base = await readEnvironmentFile('env.test');
    expect(
      parseEnvironment.bind(undefined, environmentSchema, { ...base, CORS_ALLOWED_ORIGINS: value }),
    ).toThrow(EnvironmentError);
  });

  test.each(['-1', '1.5', 'many', '11'])('rejects TRUSTED_PROXY_HOPS=%s', async (value) => {
    const base = await readEnvironmentFile('env.test');
    expect(
      parseEnvironment.bind(undefined, environmentSchema, { ...base, TRUSTED_PROXY_HOPS: value }),
    ).toThrow(EnvironmentError);
  });

  test('TRUSTED_PROXY_HOPS is an integer that defaults to 0', async () => {
    const base = await readEnvironmentFile('env.test');
    delete base['TRUSTED_PROXY_HOPS'];
    expect(parseEnvironment(environmentSchema, base).TRUSTED_PROXY_HOPS).toBe(0);
    expect(
      parseEnvironment(environmentSchema, { ...base, TRUSTED_PROXY_HOPS: '2' }).TRUSTED_PROXY_HOPS,
    ).toBe(2);
  });

  test.each([...SESSION_VARIABLES])('fails at boot when %s is missing', async (variable) => {
    const base = await readEnvironmentFile('env.test');
    delete base[variable];
    const error = ((): unknown => {
      try {
        parseEnvironment(environmentSchema, base);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(EnvironmentError);
    expect((error as EnvironmentError).issues.join('\n')).toContain(variable);
  });

  test('parses the session settings, including the list of redirect URIs', async () => {
    const base = await readEnvironmentFile('env.test');
    const environment = parseEnvironment(environmentSchema, {
      ...base,
      SESSION_ALLOWED_REDIRECT_URIS: 'https://a.example.com/cb , https://b.example.com/cb,',
    });
    expect(environment.SESSION_ALLOWED_REDIRECT_URIS).toStrictEqual([
      'https://a.example.com/cb',
      'https://b.example.com/cb',
    ]);
    expect(environment.KEYCLOAK_SESSION_CLIENT_ID).toBe('ativada-session');
  });

  test.each(['', 'not-a-url', ' , '])('rejects SESSION_ALLOWED_REDIRECT_URIS=%p', async (value) => {
    const base = await readEnvironmentFile('env.test');
    expect(
      parseEnvironment.bind(undefined, environmentSchema, {
        ...base,
        SESSION_ALLOWED_REDIRECT_URIS: value,
      }),
    ).toThrow(EnvironmentError);
  });

  test.each([...IDENTITY_ADMIN_VARIABLES])('fails at boot when %s is missing', async (variable) => {
    const base = await readEnvironmentFile('env.test');
    delete base[variable];
    expect(parseEnvironment.bind(undefined, environmentSchema, base)).toThrow(EnvironmentError);
  });

  test('the service account settings point at the ativada-api-service client', async () => {
    const environment = parseEnvironment(environmentSchema, await readEnvironmentFile('env.test'));
    expect(environment.KEYCLOAK_SERVICE_CLIENT_ID).toBe('ativada-api-service');
    expect(environment.KEYCLOAK_ADMIN_API_URL.endsWith('/admin/realms/ativada')).toBe(true);
  });

  test('Telegram settings are optional and the API base URL has a default', async () => {
    const base = await readEnvironmentFile('env.test');
    delete base['TELEGRAM_BOT_TOKEN'];
    delete base['TELEGRAM_WEBHOOK_SECRET'];
    delete base['TELEGRAM_API_BASE_URL'];
    const environment = parseEnvironment(environmentSchema, base);
    expect(environment.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(environment.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
    expect(environment.TELEGRAM_API_BASE_URL).toBe('https://api.telegram.org');
  });

  test.each(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'])(
    'fails at boot when only %s is set',
    async (kept) => {
      const base = await readEnvironmentFile('env.test');
      const dropped =
        kept === 'TELEGRAM_BOT_TOKEN' ? 'TELEGRAM_WEBHOOK_SECRET' : 'TELEGRAM_BOT_TOKEN';
      delete base[dropped];
      expect(parseEnvironment.bind(undefined, environmentSchema, base)).toThrow(EnvironmentError);
    },
  );

  test.each(['short', 'has space in the secret value', 'x'.repeat(257)])(
    'rejects TELEGRAM_WEBHOOK_SECRET=%p',
    async (value) => {
      const base = await readEnvironmentFile('env.test');
      expect(
        parseEnvironment.bind(undefined, environmentSchema, {
          ...base,
          TELEGRAM_WEBHOOK_SECRET: value,
        }),
      ).toThrow(EnvironmentError);
    },
  );

  test('the committed environment files carry only fake Telegram values', async () => {
    for (const fileName of ['env.dev', 'env.test']) {
      const values = await readEnvironmentFile(fileName);
      expect(values['TELEGRAM_BOT_TOKEN']).toContain('FAKE');
      expect(values['TELEGRAM_WEBHOOK_SECRET']).toContain('fake');
      expect(values['TELEGRAM_API_BASE_URL']?.startsWith('http://127.0.0.1:')).toBe(true);
    }
  });

  test('RATE_LIMIT_MULTIPLIER defaults to 1 and only ENV=dev may raise it', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseEnvironment(environmentSchema, base).RATE_LIMIT_MULTIPLIER).toBe(1);
    const devValues = { ...base, ENV: 'dev', RATE_LIMIT_MULTIPLIER: '4' };
    expect(parseEnvironment(environmentSchema, devValues).RATE_LIMIT_MULTIPLIER).toBe(4);
    for (const environmentName of ['test', 'production']) {
      expect(
        parseEnvironment.bind(undefined, environmentSchema, {
          ...base,
          ENV: environmentName,
          RATE_LIMIT_MULTIPLIER: '4',
        }),
      ).toThrow(EnvironmentError);
    }
  });

  test.each(['0', '21', '1.5', 'many'])('rejects RATE_LIMIT_MULTIPLIER=%p', async (value) => {
    const base = await readEnvironmentFile('env.test');
    expect(
      parseEnvironment.bind(undefined, environmentSchema, {
        ...base,
        RATE_LIMIT_MULTIPLIER: value,
      }),
    ).toThrow(EnvironmentError);
  });

  test('the committed dev file raises the multiplier and the test file leaves it alone', async () => {
    const dev = parseEnvironment(environmentSchema, await readEnvironmentFile('env.dev'));
    const test = parseEnvironment(environmentSchema, await readEnvironmentFile('env.test'));
    expect(dev.RATE_LIMIT_MULTIPLIER).toBe(4);
    expect(test.RATE_LIMIT_MULTIPLIER).toBe(1);
  });
});
