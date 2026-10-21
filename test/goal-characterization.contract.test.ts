// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../packages/strategy-engine/src/canonical-json.js';
import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';
import { GOAL_CASES, type GoalCase } from './fixtures/strategy-engine/goal/goal-cases.fixture.js';
import { REAL_SCENARIOS } from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';

const api = await loadGoalApi();
const TIMEOUT_MILLISECONDS = 120_000;
const GOLDEN_PATH = join(
  import.meta.dir,
  'fixtures/strategy-engine/goal/goal-characterization.json',
);
const REWRITE_VARIABLE = 'GOAL_CHARACTERIZATION_REWRITE';

const EXTRA_REAL_CASES: readonly GoalCase[] = REAL_SCENARIOS.map((scenario) => ({
  name: `${scenario.name}, +5% em 14 dias, perda 3% (real)`,
  scenario,
  goal: { targetRate: '0.05', maxLossRate: '0.03', horizonDays: 14 },
}));
const ALL_CASES: readonly GoalCase[] = [...GOAL_CASES, ...EXTRA_REAL_CASES];

function evaluateCase(entry: GoalCase): string {
  const { scenario } = entry;
  return canonicalJson(
    api.evaluateGoal({
      strategy: scenario.strategy,
      run: scenario.run,
      candles: scenario.candles,
      goal: entry.goal,
      sentiments: scenario.sentiments,
    }),
  );
}

function readGolden(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Dourado inválido.');
  return Object.fromEntries(Object.entries(parsed));
}

describe('caracterização: o resultado das metas é o mesmo, byte a byte, de antes da extração', () => {
  if (Bun.env[REWRITE_VARIABLE] === '1') {
    test(
      'regrava o dourado',
      () => {
        const golden = Object.fromEntries(
          ALL_CASES.map((entry) => [entry.name, evaluateCase(entry)]),
        );
        writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
      },
      TIMEOUT_MILLISECONDS,
    );
    return;
  }
  const golden = readGolden();
  test('o dourado cobre exatamente os casos', () => {
    expect(Object.keys(golden).sort()).toEqual(ALL_CASES.map((entry) => entry.name).sort());
  });
  test.each(ALL_CASES.map((entry) => [entry.name, entry] as const))(
    '%s',
    (name, entry) => {
      expect(evaluateCase(entry)).toBe(golden[name] ?? '');
    },
    TIMEOUT_MILLISECONDS,
  );
});
