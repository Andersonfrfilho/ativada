// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { environmentSchema } from '../apps/api-ativada/src/environment.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type LimitCase = {
  readonly variable: string;
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum: number;
};

const LIMITS: readonly LimitCase[] = [
  { variable: 'PRICE_ALERT_MIN_REFIRE_SECONDS', fallback: 300, minimum: 0, maximum: 86_400 },
  { variable: 'PRICE_ALERT_MAX_DISABLED_PER_USER', fallback: 100, minimum: 1, maximum: 500 },
  { variable: 'RUN_STORAGE_MAX_PER_USER', fallback: 200, minimum: 1, maximum: 10_000 },
  { variable: 'STRATEGY_MAX_PER_USER', fallback: 100, minimum: 1, maximum: 1_000 },
  { variable: 'STRATEGY_MAX_VERSIONS_PER_STRATEGY', fallback: 200, minimum: 1, maximum: 2_000 },
  { variable: 'GOAL_EVALUATION_THREADS', fallback: 2, minimum: 1, maximum: 4 },
  { variable: 'GOAL_EVALUATION_TIMEOUT_SECONDS', fallback: 30, minimum: 5, maximum: 300 },
  { variable: 'GOAL_EVALUATION_MAX_CONCURRENT', fallback: 4, minimum: 1, maximum: 32 },
];

type Source = Record<string, string>;

function parseWith(base: Source, overrides: Source): Record<string, unknown> {
  return parseEnvironment(environmentSchema, { ...base, ...overrides });
}

const REJECTED_VALUES: readonly {
  readonly name: string;
  readonly valueOf: (limit: LimitCase) => string;
}[] = [
  { name: 'below the minimum', valueOf: (limit) => String(limit.minimum - 1) },
  { name: 'above the maximum', valueOf: (limit) => String(limit.maximum + 1) },
  { name: 'not an integer', valueOf: () => '1.5' },
  { name: 'text', valueOf: () => 'muitos' },
];

for (const limit of LIMITS) {
  const { variable } = limit;
  describe(variable, () => {
    test('has a small default when omitted', async () => {
      const base = await readEnvironmentFile('env.test');
      delete base[variable];
      expect(parseWith(base, {})[variable]).toBe(limit.fallback);
    });

    test('accepts both ends of its range', async () => {
      const base = await readEnvironmentFile('env.test');
      expect(parseWith(base, { [variable]: String(limit.minimum) })[variable]).toBe(limit.minimum);
      expect(parseWith(base, { [variable]: String(limit.maximum) })[variable]).toBe(limit.maximum);
    });

    for (const rejected of REJECTED_VALUES) {
      test(`rejects a value ${rejected.name}, naming the variable`, async () => {
        const base = await readEnvironmentFile('env.test');
        const attempt = (): unknown => parseWith(base, { [variable]: rejected.valueOf(limit) });
        expect(attempt).toThrow(EnvironmentError);
        expect(attempt).toThrow(variable);
      });
    }
  });
}

describe('DATABASE_SSL_ROOT_CERT (a CA própria do banco, em PEM)', () => {
  const PEM = '-----BEGIN CERTIFICATE-----\nMIIBdemo\n-----END CERTIFICATE-----';

  test('é opcional', async () => {
    const base = await readEnvironmentFile('env.test');
    delete base['DATABASE_SSL_ROOT_CERT'];
    expect(parseWith(base, {})['DATABASE_SSL_ROOT_CERT']).toBeUndefined();
  });

  test('aceita o PEM, inclusive numa linha só com \\n literal', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseWith(base, { DATABASE_SSL_ROOT_CERT: PEM })['DATABASE_SSL_ROOT_CERT']).toBe(PEM);
    const oneLine = PEM.replaceAll('\n', String.raw`\n`);
    expect(parseWith(base, { DATABASE_SSL_ROOT_CERT: oneLine })['DATABASE_SSL_ROOT_CERT']).toBe(
      PEM,
    );
  });

  test.each([
    'qualquer coisa',
    '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    'x'.repeat(70_000),
  ])('recusa o que não é certificado PEM, sem ecoar o valor', async (value) => {
    const base = await readEnvironmentFile('env.test');
    const attempt = (): unknown => parseWith(base, { DATABASE_SSL_ROOT_CERT: value });
    expect(attempt).toThrow('DATABASE_SSL_ROOT_CERT');
  });
});
