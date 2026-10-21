// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  EngineDecimal,
  formatEngineDecimal,
  type EngineDecimalValue,
} from '../packages/strategy-engine/src/engine-decimal.js';
import { CLASSIC_STRATEGY } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  FAST_STRATEGY,
  REAL_SCENARIOS,
  gapDownScenario,
  sentimentScenario,
  syntheticScenario,
  type GoalScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';
import { loadHorizonApi } from './fixtures/strategy-engine/horizon/horizon-api.fixture.js';
import { runHorizonOracle } from './fixtures/strategy-engine/horizon/horizon-oracle.fixture.js';
import { computeScenarioWindows } from './fixtures/strategy-engine/horizon/horizon-run.fixture.js';

const api = await loadHorizonApi();
const TIMEOUT_MILLISECONDS = 180_000;
const RATE_PLACES = 8;

const [btcHourly, ethDaily] = REAL_SCENARIOS;
if (btcHourly === undefined || ethDaily === undefined) throw new Error('Conjuntos reais ausentes.');

type Case = {
  readonly name: string;
  readonly scenario: GoalScenario;
  readonly horizonDays: number;
};

const CASES: readonly Case[] = [
  { name: 'ETH diário, 7 dias', scenario: ethDaily, horizonDays: 7 },
  { name: 'ETH diário, 15 dias', scenario: ethDaily, horizonDays: 15 },
  { name: 'ETH diário, 30 dias', scenario: ethDaily, horizonDays: 30 },
  { name: 'BTC 1h, 7 dias', scenario: btcHourly, horizonDays: 7 },
  {
    name: 'gaps de baixa, 7 dias',
    scenario: gapDownScenario({ seed: 6, count: 700, strategy: FAST_STRATEGY }),
    horizonDays: 7,
  },
  {
    name: 'sentimento, 7 dias',
    scenario: sentimentScenario({ seed: 8, count: 700 }),
    horizonDays: 7,
  },
  ...[1, 2].flatMap((seed): Case[] => [
    {
      name: `sintética ${seed}, rápida, 7 dias`,
      scenario: syntheticScenario({ seed, count: 700, strategy: FAST_STRATEGY }),
      horizonDays: 7,
    },
    {
      name: `sintética ${seed}, clássica, 7 dias`,
      scenario: syntheticScenario({ seed, count: 700, strategy: CLASSIC_STRATEGY }),
      horizonDays: 7,
    },
    {
      name: `sintética ${seed}, rápida, 15 dias`,
      scenario: syntheticScenario({ seed, count: 700, strategy: FAST_STRATEGY }),
      horizonDays: 15,
    },
  ]),
];

function floorText(value: EngineDecimalValue): string {
  return formatEngineDecimal(value.toDecimalPlaces(RATE_PLACES, EngineDecimal.ROUND_FLOOR));
}

describe('as janelas dos prazos batem com o oráculo ingênuo, janela por janela refeita do zero', () => {
  test.each(CASES.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_name, entry) => {
      const { scenario, horizonDays } = entry;
      const actual = computeScenarioWindows({ api, scenario, horizonDays });
      const expected = runHorizonOracle({
        strategy: scenario.strategy,
        run: scenario.run,
        candles: scenario.candles,
        horizonDays,
        sentiments: scenario.sentiments,
      });
      expect(actual.returns.map(floorText)).toStrictEqual([...expected.returns]);
      expect(actual.benchmarkReturns.map(floorText)).toStrictEqual([...expected.benchmarkReturns]);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'o conjunto de casos exercita janelas ganhadoras, perdedoras e sem compra',
    () => {
      const all = CASES.map((entry) => {
        const { scenario, horizonDays } = entry;
        return computeScenarioWindows({ api, scenario, horizonDays }).returns;
      }).flat();
      expect(all.some((value) => value.greaterThan(0))).toBe(true);
      expect(all.some((value) => value.lessThan(0))).toBe(true);
      expect(all.some((value) => value.isZero())).toBe(true);
    },
    TIMEOUT_MILLISECONDS,
  );
});
