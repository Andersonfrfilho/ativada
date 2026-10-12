// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  environmentSchema,
  walkForwardWorkerEnvironmentSchema,
} from '../apps/api-ativada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const DEFAULT_THREADS = 2;

function issuesOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.issues.join('\n');
  }
  return '';
}

describe('WALK_FORWARD_THREADS (ambiente da API)', () => {
  test('o padrão é 2 e aceita de 1 a 8', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseEnvironment(environmentSchema, base).WALK_FORWARD_THREADS).toBe(DEFAULT_THREADS);
    for (const value of ['1', '4', '8']) {
      const parsed = parseEnvironment(environmentSchema, { ...base, WALK_FORWARD_THREADS: value });
      expect(parsed.WALK_FORWARD_THREADS).toBe(Number(value));
    }
  });

  test.each(['0', '9', '-1', '1.5', 'abc', ''])('recusa %p, nomeando a variável', async (value) => {
    const base = await readEnvironmentFile('env.test');
    const issues = issuesOf(() =>
      parseEnvironment(environmentSchema, { ...base, WALK_FORWARD_THREADS: value }),
    );
    expect(issues).toContain('WALK_FORWARD_THREADS');
  });
});

describe('ambiente da thread do walk-forward', () => {
  test('precisa de um Postgres e das threads, e não repete a URL inválida', async () => {
    const base = await readEnvironmentFile('env.test');
    const databaseUrl = base.DATABASE_URL ?? '';
    const parsed = parseEnvironment(walkForwardWorkerEnvironmentSchema, {
      DATABASE_URL: databaseUrl,
      WALK_FORWARD_THREADS: '3',
    });
    expect(parsed).toEqual({ DATABASE_URL: databaseUrl, WALK_FORWARD_THREADS: 3 });
    const defaults = parseEnvironment(walkForwardWorkerEnvironmentSchema, {
      DATABASE_URL: databaseUrl,
    });
    expect(defaults.WALK_FORWARD_THREADS).toBe(DEFAULT_THREADS);
    const issues = issuesOf(() =>
      parseEnvironment(walkForwardWorkerEnvironmentSchema, { DATABASE_URL: 'nao-e-url-s3cr3t' }),
    );
    expect(issues).toContain('DATABASE_URL');
    expect(issues).not.toContain('s3cr3t');
  });
});
