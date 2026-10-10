// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { CLASSIC_STRATEGY } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { loadGoalApi } from './fixtures/strategy-engine/goal/goal-api.fixture.js';
import {
  runGoalOracle,
  type OracleGoal,
} from './fixtures/strategy-engine/goal/goal-oracle.fixture.js';
import {
  FAST_STRATEGY,
  REAL_SCENARIOS,
  gapDownScenario,
  sentimentScenario,
  syntheticScenario,
  type GoalScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';

const api = await loadGoalApi();
const TIMEOUT_MILLISECONDS = 120_000;

type Case = {
  readonly name: string;
  readonly scenario: GoalScenario;
  readonly goal: OracleGoal;
};

function goal(targetRate: string, maxLossRate: string, horizonDays: number): OracleGoal {
  return { targetRate, maxLossRate, horizonDays };
}

const [btcHourly, ethDaily] = REAL_SCENARIOS;
if (btcHourly === undefined || ethDaily === undefined) throw new Error('Conjuntos reais ausentes.');

const CASES: readonly Case[] = [
  {
    name: 'ETH diário, +2% em 30 dias, perda 5%',
    scenario: ethDaily,
    goal: goal('0.02', '0.05', 30),
  },
  {
    name: 'ETH diário, +1% em 10 dias, perda 2%',
    scenario: ethDaily,
    goal: goal('0.01', '0.02', 10),
  },
  {
    name: 'ETH diário, +10% em 7 dias, perda 1%',
    scenario: ethDaily,
    goal: goal('0.1', '0.01', 7),
  },
  { name: 'BTC 1h, +1% em 3 dias, perda 2%', scenario: btcHourly, goal: goal('0.01', '0.02', 3) },
  {
    name: 'BTC 1h, prazo de 1 dia, perda 0,5%',
    scenario: btcHourly,
    goal: goal('0.002', '0.005', 1),
  },
  {
    name: 'com gaps de baixa, +3% em 2 dias, perda 4%',
    scenario: gapDownScenario({ seed: 6, count: 700, strategy: FAST_STRATEGY }),
    goal: goal('0.03', '0.04', 2),
  },
  {
    name: 'sentimento, +2% em 3 dias, perda 3%',
    scenario: sentimentScenario({ seed: 8, count: 700 }),
    goal: goal('0.02', '0.03', 3),
  },
  ...[1, 2, 3, 4].flatMap((seed): Case[] => {
    const fast = syntheticScenario({ seed, count: 700, strategy: FAST_STRATEGY });
    const classic = syntheticScenario({ seed, count: 700, strategy: CLASSIC_STRATEGY });
    return [
      {
        name: `sintética ${seed}, rápida, +2% em 3 dias`,
        scenario: fast,
        goal: goal('0.02', '0.03', 3),
      },
      {
        name: `sintética ${seed}, rápida, +4% em 1 dia`,
        scenario: fast,
        goal: goal('0.04', '0.02', 1),
      },
      {
        name: `sintética ${seed}, clássica, +1% em 2 dias`,
        scenario: classic,
        goal: goal('0.01', '0.02', 2),
      },
    ];
  }),
];

describe('o resultado bate com o oráculo ingênuo, janela por janela refeita do zero', () => {
  test.each(CASES.map((entry) => [entry.name, entry] as const))(
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
      const outcomes = CASES.map((entry) =>
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
