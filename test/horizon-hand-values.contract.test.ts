// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { toEngineDecimal } from '../packages/strategy-engine/src/engine-decimal.js';
import type {
  HorizonSummary,
  HorizonWindows,
} from '../packages/strategy-engine/src/horizon/horizon.types.js';
import { loadHorizonApi } from './fixtures/strategy-engine/horizon/horizon-api.fixture.js';
import {
  computeScenarioWindows,
  firstDecidedIndexOf,
  horizonCandlesOf,
} from './fixtures/strategy-engine/horizon/horizon-run.fixture.js';
import {
  NEVER_BUYS_STRATEGY,
  syntheticScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';

const api = await loadHorizonApi();
const TIMEOUT_MILLISECONDS = 120_000;
const HORIZON_DAYS = 7;

function windowsOf(
  returns: readonly string[],
  benchmarkReturns: readonly string[] = returns,
): HorizonWindows {
  return {
    returns: returns.map((value) => toEngineDecimal(value)),
    benchmarkReturns: benchmarkReturns.map((value) => toEngineDecimal(value)),
  };
}

function summarize(
  returns: readonly string[],
  benchmarkReturns?: readonly string[],
): HorizonSummary {
  return api.summarizeHorizon({
    windows: windowsOf(returns, benchmarkReturns),
    horizonDays: HORIZON_DAYS,
  });
}

describe('summarizeHorizon: contas à mão', () => {
  // Série A (5 janelas, ímpar). Ordenada: -0.08 -0.02 0 0.05 0.10. Mediana = 0 (o do meio); positivas = 2 (o zero
  // não conta); pior 10% = posto ceil(5/10) = 1 → -0.08. Comprar e segurar: mediana 0.03, todas positivas, p10 0.01.
  test('série A: 5 janelas, mediana do meio, zero não é positivo', () => {
    const summary = summarize(
      ['0.05', '-0.02', '0.10', '0', '-0.08'],
      ['0.01', '0.02', '0.03', '0.04', '0.05'],
    );
    expect(summary).toStrictEqual({
      horizonDays: HORIZON_DAYS,
      windowCount: 5,
      positiveCount: 2,
      median: '0',
      positiveRate: '0.4',
      worstDecile: '-0.08',
      isShortHistory: true,
      benchmark: { median: '0.03', positiveRate: '1', worstDecile: '0.01' },
    });
  });

  // Série B (4 janelas, par). Ordenada: -0.01 0.02 0.03 0.07. Mediana = (0.02 + 0.03) / 2 = 0.025; positivas 3/4;
  // pior 10% = posto ceil(4/10) = 1 → -0.01.
  test('série B: 4 janelas, mediana é a média dos dois do meio', () => {
    const summary = summarize(['0.03', '-0.01', '0.07', '0.02']);
    expect(summary.median).toBe('0.025');
    expect(summary.positiveCount).toBe(3);
    expect(summary.positiveRate).toBe('0.75');
    expect(summary.worstDecile).toBe('-0.01');
  });

  // Série C (11 janelas). Ordenada: -0.30 -0.20 -0.10 -0.05 0 0.01 0.02 0.04 0.06 0.08 0.50. Mediana = 6º = 0.01.
  // Pior 10% = posto ceil(11/10) = 2 → -0.20 (o piso daria o 1º, -0.30). Positivas = 6.
  test('série C: o pior 10% é o posto de cima (ceil), não o de baixo', () => {
    const summary = summarize([
      '0.02',
      '-0.30',
      '0.50',
      '0.01',
      '-0.10',
      '0.06',
      '-0.20',
      '0.04',
      '0',
      '0.08',
      '-0.05',
    ]);
    expect(summary.median).toBe('0.01');
    expect(summary.worstDecile).toBe('-0.2');
    expect(summary.positiveCount).toBe(6);
    expect(summary.positiveRate).toBe('0.54545454');
  });

  test('10 janelas: o pior 10% é exatamente o menor', () => {
    const returns = ['-0.4', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'];
    expect(summarize(returns).worstDecile).toBe('-0.4');
  });

  test('arredonda para BAIXO só no fim, também os negativos', () => {
    const summary = summarize(['-0.123456781', '0.123456789', '0.0000000049']);
    expect(summary.median).toBe('0');
    expect(summary.worstDecile).toBe('-0.12345679');
    expect(summary.positiveRate).toBe('0.66666666');
  });

  test('a mediana par é exata antes de arredondar: média de 0.000000015 e 0.000000016', () => {
    expect(summarize(['0.000000015', '0.000000016']).median).toBe('0.00000001');
    expect(summarize(['-0.000000015', '-0.000000016']).median).toBe('-0.00000002');
  });

  test('histórico curto: menos de 60 janelas', () => {
    const returns = (count: number): string[] => Array.from({ length: count }, () => '0.01');
    expect(summarize(returns(59)).isShortHistory).toBe(true);
    expect(summarize(returns(60)).isShortHistory).toBe(false);
  });

  test('sem janela: tudo nulo, histórico curto', () => {
    expect(summarize([])).toStrictEqual({
      horizonDays: HORIZON_DAYS,
      windowCount: 0,
      positiveCount: 0,
      median: null,
      positiveRate: null,
      worstDecile: null,
      isShortHistory: true,
      benchmark: { median: null, positiveRate: null, worstDecile: null },
    });
  });
});

describe('computeHorizonWindows: contas à mão', () => {
  const scenario = syntheticScenario({ seed: 1, count: 700, strategy: NEVER_BUYS_STRATEGY });

  test(
    'estratégia que nunca compra: uma janela por candle decidido cujo prazo cabe, todas valendo exatamente 0',
    () => {
      const windows = computeScenarioWindows({ api, scenario, horizonDays: HORIZON_DAYS });
      const horizon = horizonCandlesOf(scenario, HORIZON_DAYS);
      const first = firstDecidedIndexOf(scenario, scenario.candles);
      expect(horizon).toBe(168);
      expect(windows.returns.length).toBe(scenario.candles.length - horizon - first + 1);
      expect(windows.benchmarkReturns.length).toBe(windows.returns.length);
      expect(windows.returns.every((value) => value.isZero())).toBe(true);
      const summary = api.summarizeHorizon({ windows, horizonDays: HORIZON_DAYS });
      expect(summary.positiveCount).toBe(0);
      expect(summary.positiveRate).toBe('0');
      expect(summary.median).toBe('0');
    },
    TIMEOUT_MILLISECONDS,
  );

  test('prazo maior que a série: nenhuma janela', () => {
    const windows = computeScenarioWindows({ api, scenario, horizonDays: 30 });
    expect(windows.returns).toStrictEqual([]);
    expect(windows.benchmarkReturns).toStrictEqual([]);
  });

  test('o comprar e segurar compra e paga taxa: não vale zero numa série que não sobe', () => {
    const windows = computeScenarioWindows({ api, scenario, horizonDays: HORIZON_DAYS });
    expect(windows.benchmarkReturns.some((value) => !value.isZero())).toBe(true);
  });
});
