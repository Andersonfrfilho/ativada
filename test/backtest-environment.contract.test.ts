// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  backtestWorkerEnvironmentSchema,
  environmentSchema,
} from '../apps/api-ativada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const DEFAULT_TIMEOUT_SECONDS = 900;

function issuesOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.issues.join('\n');
  }
  return '';
}

describe('backtest timeout (API environment)', () => {
  test('defaults to a high limit and accepts an explicit value', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseEnvironment(environmentSchema, base).BACKTEST_TIMEOUT_SECONDS).toBe(
      DEFAULT_TIMEOUT_SECONDS,
    );
    const explicit = parseEnvironment(environmentSchema, {
      ...base,
      BACKTEST_TIMEOUT_SECONDS: '60',
    });
    expect(explicit.BACKTEST_TIMEOUT_SECONDS).toBe(60);
  });

  test.each(['0', '4', '86401', '1.5', 'abc', ''])(
    'rejects %p, naming the variable',
    async (value) => {
      const base = await readEnvironmentFile('env.test');
      const issues = issuesOf(() =>
        parseEnvironment(environmentSchema, { ...base, BACKTEST_TIMEOUT_SECONDS: value }),
      );
      expect(issues).toContain('BACKTEST_TIMEOUT_SECONDS');
    },
  );
});

describe('backtest thread environment', () => {
  test('needs a Postgres URL and never echoes it back when invalid', async () => {
    const base = await readEnvironmentFile('env.test');
    const databaseUrl = base.DATABASE_URL ?? '';
    const parsed = parseEnvironment(backtestWorkerEnvironmentSchema, { DATABASE_URL: databaseUrl });
    expect(parsed.DATABASE_URL).toBe(databaseUrl);
    const issues = issuesOf(() =>
      parseEnvironment(backtestWorkerEnvironmentSchema, { DATABASE_URL: 'not-a-url-s3cr3t' }),
    );
    expect(issues).toContain('DATABASE_URL');
    expect(issues).not.toContain('s3cr3t');
  });
});
