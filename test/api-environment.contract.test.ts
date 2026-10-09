// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { environmentSchema } from '../apps/api-crypto/src/environment.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const AUTHENTICATION_VARIABLES: readonly string[] = [
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_JWKS_URL',
  'API_AUDIENCE',
  'AUTHORIZED_PARTIES',
  'CORS_ALLOWED_ORIGINS',
];

describe('api-crypto environment (authentication, CORS and proxies)', () => {
  test.each(['env.dev', 'env.test'])('%s satisfies the schema', async (fileName) => {
    const environment = parseEnvironment(environmentSchema, await readEnvironmentFile(fileName));
    expect(environment.API_AUDIENCE).toBe('crypto-api');
    expect(environment.AUTHORIZED_PARTIES).toStrictEqual(['crypto-session']);
    expect(environment.CORS_ALLOWED_ORIGINS.length).toBeGreaterThan(0);
    expect(environment.TRUSTED_PROXY_HOPS).toBe(0);
    expect(environment.KEYCLOAK_ISSUER.endsWith('/realms/crypto-paper-trader')).toBe(true);
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
      AUTHORIZED_PARTIES: 'crypto-session, crypto-other,',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com , http://127.0.0.1:56100',
    });
    expect(environment.AUTHORIZED_PARTIES).toStrictEqual(['crypto-session', 'crypto-other']);
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
});
