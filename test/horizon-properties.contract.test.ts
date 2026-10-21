// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  EngineDecimal,
  type EngineDecimalValue,
} from '../packages/strategy-engine/src/engine-decimal.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import {
  FAST_STRATEGY,
  NEVER_BUYS_STRATEGY,
  REAL_SCENARIOS,
  syntheticScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';
import { loadHorizonApi } from './fixtures/strategy-engine/horizon/horizon-api.fixture.js';
import {
  computeScenarioWindows,
  firstDecidedIndexOf,
  horizonCandlesOf,
} from './fixtures/strategy-engine/horizon/horizon-run.fixture.js';

const api = await loadHorizonApi();
const TIMEOUT_MILLISECONDS = 120_000;
const RANDOM_SERIES = 300;

function decimalOf(text: string | null): EngineDecimalValue {
  if (text === null) throw new Error('Resumo sem janela.');
  return new EngineDecimal(text);
}

function randomReturns(random: () => number): EngineDecimalValue[] {
  const count = 1 + Math.floor(random() * 150);
  return Array.from({ length: count }, () => {
    const cents = Math.round((random() - 0.45) * 4_000_000_000) / 100_000_000;
    return new EngineDecimal(cents);
  });
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const held = copy[index];
    const swapped = copy[other];
    if (held === undefined || swapped === undefined) continue;
    copy[index] = swapped;
    copy[other] = held;
  }
  return copy;
}

describe('summarizeHorizon: propriedades', () => {
  const random = createSeededRandom(2026);
  const inputs = Array.from({ length: RANDOM_SERIES }, () => randomReturns(random));

  test('mínimo ≤ pior 10% ≤ mediana ≤ máximo, com o arredondamento para baixo (a 1e-8 do exato)', () => {
    const tolerance = new EngineDecimal('0.00000001');
    for (const returns of inputs) {
      const summary = api.summarizeHorizon({
        windows: { returns, benchmarkReturns: returns },
        horizonDays: 7,
      });
      const sorted = [...returns].sort((left, right) => left.comparedTo(right));
      const minimum = sorted[0] ?? new EngineDecimal(0);
      const maximum = sorted.at(-1) ?? new EngineDecimal(0);
      const decile = decimalOf(summary.worstDecile);
      const median = decimalOf(summary.median);
      expect(decile.plus(tolerance).greaterThanOrEqualTo(minimum)).toBe(true);
      expect(decile.lessThanOrEqualTo(median)).toBe(true);
      expect(median.lessThanOrEqualTo(maximum)).toBe(true);
      expect(median.plus(tolerance).greaterThanOrEqualTo(minimum)).toBe(true);
    }
  });

  test('0 ≤ positivas ≤ janelas e a taxa é positivas ÷ janelas, arredondada para baixo', () => {
    for (const returns of inputs) {
      const summary = api.summarizeHorizon({
        windows: { returns, benchmarkReturns: returns },
        horizonDays: 15,
      });
      expect(summary.positiveCount).toBeGreaterThanOrEqual(0);
      expect(summary.positiveCount).toBeLessThanOrEqual(summary.windowCount);
      expect(summary.windowCount).toBe(returns.length);
      const exact = new EngineDecimal(summary.positiveCount).dividedBy(returns.length);
      const rate = decimalOf(summary.positiveRate);
      expect(rate.lessThanOrEqualTo(exact)).toBe(true);
      expect(exact.minus(rate).lessThan('0.00000001')).toBe(true);
    }
  });

  test('permutar a entrada não muda a saída', () => {
    const shuffler = createSeededRandom(7);
    for (const returns of inputs) {
      const benchmarkReturns = shuffled(returns, shuffler);
      const original = api.summarizeHorizon({
        windows: { returns, benchmarkReturns },
        horizonDays: 30,
      });
      const permuted = api.summarizeHorizon({
        windows: {
          returns: shuffled(returns, shuffler),
          benchmarkReturns: shuffled(benchmarkReturns, shuffler),
        },
        horizonDays: 30,
      });
      expect(permuted).toStrictEqual(original);
    }
  });
});

describe('computeHorizonWindows: propriedades', () => {
  test('estratégia que nunca compra: retornos 0 e % positivas 0, em cada prazo e série', () => {
    const [btcHourly, ethDaily] = REAL_SCENARIOS;
    if (btcHourly === undefined || ethDaily === undefined)
      throw new Error('Conjuntos reais ausentes.');
    const cases = [
      { scenario: { ...btcHourly, strategy: NEVER_BUYS_STRATEGY }, horizonDays: 7 },
      { scenario: { ...ethDaily, strategy: NEVER_BUYS_STRATEGY }, horizonDays: 30 },
      {
        scenario: syntheticScenario({ seed: 2, count: 700, strategy: NEVER_BUYS_STRATEGY }),
        horizonDays: 15,
      },
    ];
    for (const { scenario, horizonDays } of cases) {
      const windows = computeScenarioWindows({ api, scenario, horizonDays });
      const summary = api.summarizeHorizon({ windows, horizonDays });
      expect(windows.returns.length).toBeGreaterThan(0);
      expect(windows.returns.every((value) => value.isZero())).toBe(true);
      expect(summary.positiveRate).toBe('0');
      expect(summary.median).toBe('0');
    }
  });

  test(
    'sem lookahead: a série cortada dá exatamente as primeiras janelas da série inteira',
    () => {
      const scenario = syntheticScenario({ seed: 3, count: 700, strategy: FAST_STRATEGY });
      const horizonDays = 7;
      const full = computeScenarioWindows({ api, scenario, horizonDays });
      const cut = 450;
      const prefix = scenario.candles.slice(0, cut);
      const cutWindows = computeScenarioWindows({ api, scenario, horizonDays, candles: prefix });
      const expected =
        cut - horizonCandlesOf(scenario, horizonDays) - firstDecidedIndexOf(scenario, prefix) + 1;
      expect(cutWindows.returns.length).toBe(expected);
      expect(cutWindows.returns.map(String)).toStrictEqual(
        full.returns.slice(0, expected).map(String),
      );
      expect(cutWindows.benchmarkReturns.map(String)).toStrictEqual(
        full.benchmarkReturns.slice(0, expected).map(String),
      );
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'sem lookahead: trocar os candles depois do fim das janelas não muda as janelas que já existiam',
    () => {
      const scenario = syntheticScenario({ seed: 4, count: 700, strategy: FAST_STRATEGY });
      const other = syntheticScenario({ seed: 5, count: 700, strategy: FAST_STRATEGY });
      const horizonDays = 7;
      const cut = 450;
      const swapped = [...scenario.candles.slice(0, cut), ...other.candles.slice(cut)];
      const original = computeScenarioWindows({ api, scenario, horizonDays });
      const changed = computeScenarioWindows({ api, scenario, horizonDays, candles: swapped });
      const unaffected =
        cut -
        horizonCandlesOf(scenario, horizonDays) -
        firstDecidedIndexOf(scenario, scenario.candles) +
        1;
      expect(unaffected).toBeGreaterThan(100);
      expect(changed.returns.slice(0, unaffected).map(String)).toStrictEqual(
        original.returns.slice(0, unaffected).map(String),
      );
      expect(changed.returns.map(String)).not.toStrictEqual(original.returns.map(String));
    },
    TIMEOUT_MILLISECONDS,
  );
});
