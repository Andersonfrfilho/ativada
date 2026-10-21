// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';
import { runGoalOracle } from './fixtures/strategy-engine/goal/goal-oracle.fixture.js';
import { GOAL_CASES } from './fixtures/strategy-engine/goal/goal-cases.fixture.js';

const api = await loadGoalApi();
const TIMEOUT_MILLISECONDS = 120_000;

describe('o resultado bate com o oráculo ingênuo, janela por janela refeita do zero', () => {
  test.each(GOAL_CASES.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_name, entry) => {
      const { scenario } = entry;
      const actual = api.evaluateGoal({
        strategy: scenario.strategy,
        run: scenario.run,
        candles: scenario.candles,
        goal: entry.goal,
        sentiments: scenario.sentiments,
      });
      const expected = runGoalOracle({
        strategy: scenario.strategy,
        run: scenario.run,
        candles: scenario.candles,
        goal: entry.goal,
        sentiments: scenario.sentiments,
      });
      const { version, goal: echoed, ...comparable } = actual;
      expect(version).toBe('goal-1');
      expect(echoed).toStrictEqual(entry.goal);
      expect(comparable).toStrictEqual(expected);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'o conjunto de casos exercita todos os desfechos, mais de uma régua e o comprar e segurar',
    () => {
      const outcomes = GOAL_CASES.map((entry) =>
        runGoalOracle({
          strategy: entry.scenario.strategy,
          run: entry.scenario.run,
          candles: entry.scenario.candles,
          goal: entry.goal,
          sentiments: entry.scenario.sentiments,
        }),
      );
      expect(outcomes.some((outcome) => outcome.reachedCount > 0)).toBe(true);
      expect(outcomes.some((outcome) => outcome.stoppedCount > 0)).toBe(true);
      expect(outcomes.some((outcome) => outcome.expiredCount > 0)).toBe(true);
      expect(outcomes.some((outcome) => outcome.benchmark.reachedCount > 0)).toBe(true);
      expect(outcomes.some((outcome) => outcome.benchmark.stoppedCount > 0)).toBe(true);
      expect(new Set(outcomes.map((outcome) => outcome.verdict)).size).toBeGreaterThan(1);
    },
    TIMEOUT_MILLISECONDS,
  );
});
