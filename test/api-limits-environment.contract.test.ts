// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { environmentSchema } from '../apps/api-cryptoada/src/environment.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type LimitCase = {
  readonly variable: string;
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum: number;
};

const LIMITS: readonly LimitCase[] = [
  { variable: 'GOAL_EVALUATION_THREADS', fallback: 2, minimum: 1, maximum: 4 },
  { variable: 'GOAL_EVALUATION_TIMEOUT_SECONDS', fallback: 30, minimum: 5, maximum: 300 },
  { variable: 'GOAL_EVALUATION_MAX_CONCURRENT', fallback: 4, minimum: 1, maximum: 32 },
];

function parseWith(
  base: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, unknown> {
  return parseEnvironment(environmentSchema, { ...base, ...overrides });
}

describe.each(LIMITS)('$variable', ({ variable, fallback, minimum, maximum }) => {
  test('has a small default when omitted', async () => {
    const base = await readEnvironmentFile('env.test');
    delete base[variable];
    expect(parseWith(base, {})[variable]).toBe(fallback);
  });

  test('accepts both ends of its range', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseWith(base, { [variable]: String(minimum) })[variable]).toBe(minimum);
    expect(parseWith(base, { [variable]: String(maximum) })[variable]).toBe(maximum);
  });

  test.each([
    ['below the minimum', (limit: LimitCase) => String(limit.minimum - 1)],
    ['above the maximum', (limit: LimitCase) => String(limit.maximum + 1)],
    ['not an integer', () => '1.5'],
    ['text', () => 'muitos'],
  ])('rejects a value %s, naming the variable', async (_name, valueOf) => {
    const base = await readEnvironmentFile('env.test');
    const attempt = (): unknown =>
      parseWith(base, { [variable]: valueOf({ variable, fallback, minimum, maximum }) });
    expect(attempt).toThrow(EnvironmentError);
    expect(attempt).toThrow(variable);
  });
});
