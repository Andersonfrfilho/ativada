// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  INDICATOR_ERROR_CODE,
  IndicatorError,
  type ScoreboardReadings,
  type StoredSentimentObservation,
} from '../packages/strategy-engine/src/index.js';
import {
  CLASSIC_CONFIG,
  classicReadings,
  CLOSE_TIME,
  SENTIMENT_SOURCE,
} from './fixtures/strategy-engine/signal/scoreboard-configs.fixture.js';
import {
  comparableOf,
  evaluateScenario,
  expectedOf,
  familiesMismatch,
  SCOREBOARD_SCENARIOS,
} from './fixtures/strategy-engine/signal/scoreboard-scenarios.fixture.js';
import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';

const API = PRODUCTION_SIGNAL_API;

// Cada cenário é escrito à mão: indicadores injetados → votos, regime, pontuação, ação e o texto do
// motivo comparado byte a byte.
describe('scoreboard scenarios (hand-written table)', () => {
  test.each(SCOREBOARD_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      const decision = evaluateScenario(API, scenario);
      expect(comparableOf(decision)).toStrictEqual(expectedOf(scenario));
      expect(familiesMismatch(scenario, decision)).toBe(false);
    },
  );

  test('the table names are unique', () => {
    const names = SCOREBOARD_SCENARIOS.map((scenario) => scenario.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('the decision records the indicator values under namespaced, flattened ids', () => {
    const scenario = SCOREBOARD_SCENARIOS[0];
    if (scenario === undefined) throw new Error('Tabela vazia.');
    expect(evaluateScenario(API, scenario).indicators).toStrictEqual({
      'rule:ema-9-21.fast': 101,
      'rule:ema-9-21.slow': 100,
      'rule:macd-12-26-9.histogram': 1.2 - 1,
      'rule:macd-12-26-9.macd': 1.2,
      'rule:macd-12-26-9.signal': 1,
      'rule:rsi-14': 55,
      'rule:obv-ema-20.ema': 900,
      'rule:obv-ema-20.obv': 1000,
      'risk:atr': 410.5,
      'regime:adx.adx': 31.29,
      'regime:adx.minusDi': 12,
      'regime:adx.plusDi': 28,
    });
  });

  test('the reason is built without locale: same input, same bytes, "." as decimal separator', () => {
    const scenario = SCOREBOARD_SCENARIOS[1];
    if (scenario === undefined) throw new Error('Tabela vazia.');
    const first = evaluateScenario(API, scenario).reason;
    expect(evaluateScenario(API, scenario).reason).toBe(first);
    expect(first).toContain('+2.5');
    expect(first).not.toContain(',');
  });
});

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof IndicatorError ? error.code : String(error);
  }
  return 'no error';
}

const NEUTRAL = {
  ema: [100, 100],
  macd: [1, 1],
  rsi: 50,
  obv: [900, 900],
  adx: 40,
} as const;

function evaluateWith(readings: ScoreboardReadings): unknown {
  return API.evaluateScoreboard({
    config: CLASSIC_CONFIG,
    close: 100,
    closeTime: CLOSE_TIME,
    readings,
    sentiment: undefined,
    sentimentSource: SENTIMENT_SOURCE,
  });
}

describe('warm-up and missing values', () => {
  test('a value missing after the warm-up (rule, ATR or ADX) is a typed error, never a vote', () => {
    const complete = classicReadings(NEUTRAL);
    const withoutRule: ScoreboardReadings = {
      ...complete,
      rules: { ...complete.rules, 'rsi-14': { current: undefined, previous: undefined } },
    };
    const withoutRuleEntry: ScoreboardReadings = {
      ...complete,
      rules: { 'ema-9-21': { current: { fast: 1, slow: 1 }, previous: undefined } },
    };
    for (const readings of [
      withoutRule,
      withoutRuleEntry,
      { ...complete, atr: undefined },
      { ...complete, adx: undefined },
    ]) {
      expect(codeOf(() => evaluateWith(readings))).toBe(INDICATOR_ERROR_CODE.MISSING_VALUE);
    }
  });

  test('the Placar clássico lead-in is 194 candles, set by the chained ADX', () => {
    expect(API.computeStrategyLeadInCandles(CLASSIC_CONFIG)).toBe(194);
    expect(API.createStrategySignalState(CLASSIC_CONFIG)).toStrictEqual({
      leadInCandles: 194,
      processedCandles: 0,
      lastCandleOpenTime: null,
      indicators: {},
    });
  });
});

const SELECTION_CLOSE = 5_000;
const SELECTION_CUTOFF = 4_000;

function stored(overrides: Partial<StoredSentimentObservation>): StoredSentimentObservation {
  return {
    value: 50,
    observedAt: 1_000,
    source: SENTIMENT_SOURCE,
    createdAt: 1_000,
    ...overrides,
  };
}

function select(observations: readonly StoredSentimentObservation[]): unknown {
  return API.selectAvailableSentiment({
    observations,
    closeTime: SELECTION_CLOSE,
    source: SENTIMENT_SOURCE,
    insertionCutoff: SELECTION_CUTOFF,
  });
}

describe('sentiment selection: by source, by insertion cutoff and by availability', () => {
  test('keeps only the run source', () => {
    const wrong = stored({ value: 1, observedAt: 3_000, source: 'outra-fonte' });
    expect(select([stored({ value: 10 }), wrong])).toStrictEqual({
      value: 10,
      observedAt: 1_000,
      source: SENTIMENT_SOURCE,
    });
  });

  test('ignores a row inserted after the run start, even if its observation time is older', () => {
    const lateInsert = stored({ value: 1, observedAt: 3_000, createdAt: SELECTION_CUTOFF + 1 });
    const atCutoff = stored({ value: 2, observedAt: 2_000, createdAt: SELECTION_CUTOFF });
    expect(select([stored({ value: 10 }), lateInsert])).toStrictEqual({
      value: 10,
      observedAt: 1_000,
      source: SENTIMENT_SOURCE,
    });
    expect(select([stored({ value: 10 }), atCutoff])).toStrictEqual({
      value: 2,
      observedAt: 2_000,
      source: SENTIMENT_SOURCE,
    });
  });

  test('ignores an observation that only becomes available after the close', () => {
    const atClose = stored({ value: 3, observedAt: SELECTION_CLOSE, createdAt: 2_000 });
    const afterClose = stored({ value: 4, observedAt: SELECTION_CLOSE + 1, createdAt: 2_000 });
    expect(select([afterClose])).toBeUndefined();
    expect(select([stored({ value: 10 }), atClose, afterClose])).toStrictEqual({
      value: 3,
      observedAt: SELECTION_CLOSE,
      source: SENTIMENT_SOURCE,
    });
  });

  test('takes the latest observation; a tie goes to the later insertion order', () => {
    const first = stored({ value: 11, observedAt: 2_000 });
    const second = stored({ value: 22, observedAt: 2_000 });
    expect(select([first, second])).toStrictEqual({
      value: 22,
      observedAt: 2_000,
      source: SENTIMENT_SOURCE,
    });
    expect(select([second, stored({ value: 33, observedAt: 1_500 })])).toStrictEqual({
      value: 22,
      observedAt: 2_000,
      source: SENTIMENT_SOURCE,
    });
  });

  test('never leaks the insertion time into the observation handed to the engine', () => {
    expect(Object.keys(select([stored({})]) as object).sort()).toStrictEqual([
      'observedAt',
      'source',
      'value',
    ]);
  });

  test('no row for the source is no observation', () => {
    expect(select([])).toBeUndefined();
    expect(select([stored({ source: 'outra-fonte' })])).toBeUndefined();
  });
});
