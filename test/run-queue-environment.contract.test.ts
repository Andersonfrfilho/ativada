// Copyright (c) 2026 Ada Technology. All rights reserved.
import { availableParallelism } from 'node:os';

import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/api-cryptoada/src/environment.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const DEFAULT_QUEUE_PER_USER_LIMIT = 20;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 15;
const DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
const MAXIMUM_GLOBAL_CONCURRENCY = 32;

function issuesOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.issues.join('\n');
  }
  return '';
}

async function parseWith(
  overrides: Record<string, string>,
): Promise<ReturnType<typeof parseEnvironment<typeof environmentSchema>>> {
  const base = await readEnvironmentFile('env.test');
  return parseEnvironment(environmentSchema, { ...base, ...overrides });
}

describe('ambiente da fila de execuções (T3.6)', () => {
  test('os padrões: núcleos − 1 (mínimo 1), fila de 20, batimento de 15 s, vencimento em 60 s, retomar com checkpoint', async () => {
    const parsed = await parseWith({});
    expect(parsed.RUN_GLOBAL_CONCURRENCY).toBe(
      Math.min(MAXIMUM_GLOBAL_CONCURRENCY, Math.max(1, availableParallelism() - 1)),
    );
    expect(parsed.RUN_QUEUE_PER_USER_LIMIT).toBe(DEFAULT_QUEUE_PER_USER_LIMIT);
    expect(parsed.RUN_HEARTBEAT_INTERVAL_SECONDS).toBe(DEFAULT_HEARTBEAT_INTERVAL_SECONDS);
    expect(parsed.RUN_HEARTBEAT_TIMEOUT_SECONDS).toBe(DEFAULT_HEARTBEAT_TIMEOUT_SECONDS);
    expect(parsed.RUN_ORPHAN_POLICY).toBe('resume');
  });

  test('RUN_GLOBAL_CONCURRENCY aceita de 1 a 32', async () => {
    for (const value of ['1', '8', '32']) {
      expect((await parseWith({ RUN_GLOBAL_CONCURRENCY: value })).RUN_GLOBAL_CONCURRENCY).toBe(
        Number(value),
      );
    }
  });

  test.each([
    ['RUN_GLOBAL_CONCURRENCY', ['0', '33', '-1', '1.5', 'abc', '']],
    ['RUN_QUEUE_PER_USER_LIMIT', ['0', '1001', '-3', '2.5', 'x', '']],
    ['RUN_HEARTBEAT_INTERVAL_SECONDS', ['0', '301', 'x', '']],
    ['RUN_HEARTBEAT_TIMEOUT_SECONDS', ['4', '3601', 'x', '']],
    ['RUN_ORPHAN_POLICY', ['retomar', 'FAIL', '']],
  ])('recusa %s inválida, nomeando a variável', async (name, values) => {
    for (const value of values) {
      const base = await readEnvironmentFile('env.test');
      const issues = issuesOf(() =>
        parseEnvironment(environmentSchema, { ...base, [name]: value }),
      );
      expect(issues).toContain(name);
    }
  });

  test('o vencimento do batimento precisa ser maior que o intervalo', async () => {
    const base = await readEnvironmentFile('env.test');
    const issues = issuesOf(() =>
      parseEnvironment(environmentSchema, {
        ...base,
        RUN_HEARTBEAT_INTERVAL_SECONDS: '30',
        RUN_HEARTBEAT_TIMEOUT_SECONDS: '30',
      }),
    );
    expect(issues).toContain('RUN_HEARTBEAT_TIMEOUT_SECONDS');
  });

  test('aceita a política fail', async () => {
    expect((await parseWith({ RUN_ORPHAN_POLICY: 'fail' })).RUN_ORPHAN_POLICY).toBe('fail');
  });
});
