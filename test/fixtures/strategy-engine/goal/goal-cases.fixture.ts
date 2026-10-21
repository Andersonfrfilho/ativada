// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CLASSIC_STRATEGY } from '../signal/classic-signals.fixture.js';
import type { OracleGoal } from './goal-oracle.fixture.js';
import {
  FAST_STRATEGY,
  REAL_SCENARIOS,
  gapDownScenario,
  sentimentScenario,
  syntheticScenario,
  type GoalScenario,
} from './goal-scenarios.fixture.js';

export type GoalCase = {
  readonly name: string;
  readonly scenario: GoalScenario;
  readonly goal: OracleGoal;
};

function goal(targetRate: string, maxLossRate: string, horizonDays: number): OracleGoal {
  return { targetRate, maxLossRate, horizonDays };
}

const [btcHourly, ethDaily] = REAL_SCENARIOS;
if (btcHourly === undefined || ethDaily === undefined) throw new Error('Conjuntos reais ausentes.');

export const GOAL_CASES: readonly GoalCase[] = [
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
  ...[1, 2, 3, 4].flatMap((seed): GoalCase[] => {
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
