// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/cron-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type Source = Record<string, string>;

const FEAR_GREED_VARIABLES: readonly string[] = ['FEAR_GREED_API_URL', 'FEAR_GREED_REFRESH_DAYS'];
const PRODUCTION: Source = {
  ENV: 'production',
  DATABASE_URL:
    'postgres://cryptoada:prod-password-0123456789-abcdefghijkl@db.internal:5432/crypto?sslmode=verify-full',
  KEYCLOAK_TOKEN_URL: 'https://auth.crypto.example.com/token',
  KEYCLOAK_ADMIN_API_URL: 'https://auth.crypto.example.com/admin',
  KEYCLOAK_SERVICE_CLIENT_SECRET: 'S'.repeat(40),
};

async function buildSource(overrides: Source = {}): Promise<Source> {
  const base = await readEnvironmentFile('env.test');
  for (const variable of FEAR_GREED_VARIABLES) delete base[variable];
  return { ...base, ...overrides };
}

function failureOf(source: Source): string {
  try {
    parseEnvironment(environmentSchema, source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.message;
    throw error;
  }
  return '';
}

describe('cron Fear & Greed environment', () => {
  test('defaults: the public alternative.me endpoint and a 14 day refresh', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(environment.FEAR_GREED_API_URL).toBe('https://api.alternative.me/fng/');
    expect(environment.FEAR_GREED_REFRESH_DAYS).toBe(14);
  });

  test('reads explicit values and accepts the task name in CRON_TASKS', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({
        FEAR_GREED_API_URL: 'http://127.0.0.1:9/fng/',
        FEAR_GREED_REFRESH_DAYS: '30',
        CRON_TASKS: 'sync-fear-greed',
      }),
    );
    expect(environment.FEAR_GREED_API_URL).toBe('http://127.0.0.1:9/fng/');
    expect(environment.FEAR_GREED_REFRESH_DAYS).toBe(30);
    expect(environment.CRON_TASKS).toStrictEqual(['sync-fear-greed']);
  });

  test.each([
    ['FEAR_GREED_API_URL', 'not-a-url'],
    ['FEAR_GREED_API_URL', ''],
    ['FEAR_GREED_REFRESH_DAYS', '0'],
    ['FEAR_GREED_REFRESH_DAYS', '-3'],
    ['FEAR_GREED_REFRESH_DAYS', '1.5'],
    ['FEAR_GREED_REFRESH_DAYS', 'catorze'],
    ['FEAR_GREED_REFRESH_DAYS', '100000'],
  ])('%s=%j fails at boot', async (variable, value) => {
    expect(failureOf(await buildSource({ [variable]: value }))).toContain(variable);
  });

  test('production refuses a plain http Fear & Greed URL', async () => {
    const insecure = await buildSource({ ...PRODUCTION, FEAR_GREED_API_URL: 'http://x.example/' });
    expect(failureOf(insecure)).toContain('FEAR_GREED_API_URL');
    expect(failureOf(await buildSource(PRODUCTION))).toBe('');
  });

  test('both env files declare the new variables', async () => {
    for (const fileName of ['env.dev', 'env.test']) {
      const file = await readEnvironmentFile(fileName);
      for (const variable of FEAR_GREED_VARIABLES) expect(file[variable]).toBeDefined();
    }
  });
});
