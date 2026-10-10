// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  INDICATOR_ERROR_CODE,
  IndicatorError,
  type IndicatorValue,
  type Regime,
  type SentimentObservation,
  type StrategyFamily,
  type StrategyRule,
} from '../packages/strategy-engine/src/index.js';
import {
  CLASSIC_CONFIG,
  FLAT_CONFIG,
  KINDS_CONFIG,
} from './fixtures/strategy-engine/signal/scoreboard-configs.fixture.js';
import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';

const API = PRODUCTION_SIGNAL_API;
const DEFAULT_CLOSE = 100;

function ruleNamed(id: string): StrategyRule {
  const rule = KINDS_CONFIG.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`Regra ${id} ausente.`);
  return rule;
}

type VoteCase = {
  readonly label: string;
  readonly ruleId: string;
  readonly current?: IndicatorValue;
  readonly previous?: IndicatorValue;
  readonly close?: number;
  readonly sentiment?: number;
  readonly vote: -1 | 0 | 1;
  readonly isMissing?: boolean;
};

const DONCHIAN_PREVIOUS = { upper: 100, lower: 90 };
const DONCHIAN_CURRENT = { upper: 200, lower: 1 };
const BAND = { lower: 90, middle: 100, upper: 110, width: 0.2 };

const VOTE_CASES: readonly VoteCase[] = [
  {
    label: 'ema_cross: fast above slow',
    ruleId: 'ema-9-21',
    current: { fast: 10, slow: 9 },
    vote: 1,
  },
  {
    label: 'ema_cross: fast below slow',
    ruleId: 'ema-9-21',
    current: { fast: 9, slow: 10 },
    vote: -1,
  },
  { label: 'ema_cross: equal', ruleId: 'ema-9-21', current: { fast: 9, slow: 9 }, vote: 0 },
  {
    label: 'macd: line above signal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.5, signal: 0.4, histogram: 0.1 },
    vote: 1,
  },
  {
    label: 'macd: line below signal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.4, signal: 0.5, histogram: -0.1 },
    vote: -1,
  },
  {
    label: 'macd: equal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.5, signal: 0.5, histogram: 0 },
    vote: 0,
  },
  {
    label: 'donchian: close above the PREVIOUS high',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 100.01,
    vote: 1,
  },
  {
    label: 'donchian: close equal to the previous high is not a breakout',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 100,
    vote: 0,
  },
  {
    label: 'donchian: inside the channel',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 95,
    vote: 0,
  },
  {
    label: 'donchian: close equal to the previous low is not a breakdown',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 90,
    vote: 0,
  },
  {
    label: 'donchian: close below the PREVIOUS low',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 89.99,
    vote: -1,
  },
  { label: 'rsi: just below oversold', ruleId: 'rsi-14', current: 29.99, vote: 1 },
  { label: 'rsi: at oversold', ruleId: 'rsi-14', current: 30, vote: 0 },
  { label: 'rsi: plateau (50)', ruleId: 'rsi-14', current: 50, vote: 0 },
  { label: 'rsi: at overbought', ruleId: 'rsi-14', current: 70, vote: 0 },
  { label: 'rsi: just above overbought', ruleId: 'rsi-14', current: 70.01, vote: -1 },
  {
    label: 'bollinger: closes below the lower band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 89.99,
    vote: 1,
  },
  {
    label: 'bollinger: closes on the lower band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 90,
    vote: 0,
  },
  {
    label: 'bollinger: closes on the upper band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 110,
    vote: 0,
  },
  {
    label: 'bollinger: closes above the upper band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 110.01,
    vote: -1,
  },
  {
    label: 'obv_trend: OBV above its EMA',
    ruleId: 'obv-ema-20',
    current: { obv: 2, ema: 1 },
    vote: 1,
  },
  {
    label: 'obv_trend: OBV below its EMA',
    ruleId: 'obv-ema-20',
    current: { obv: 1, ema: 2 },
    vote: -1,
  },
  { label: 'obv_trend: equal', ruleId: 'obv-ema-20', current: { obv: 1, ema: 1 }, vote: 0 },
  {
    label: 'fear_greed: extreme fear buys (contrarian)',
    ruleId: 'fear-greed',
    sentiment: 25,
    vote: 1,
  },
  { label: 'fear_greed: zero buys', ruleId: 'fear-greed', sentiment: 0, vote: 1 },
  { label: 'fear_greed: just above fear is neutral', ruleId: 'fear-greed', sentiment: 26, vote: 0 },
  {
    label: 'fear_greed: just below greed is neutral',
    ruleId: 'fear-greed',
    sentiment: 74,
    vote: 0,
  },
  { label: 'fear_greed: extreme greed sells', ruleId: 'fear-greed', sentiment: 75, vote: -1 },
  { label: 'fear_greed: one hundred sells', ruleId: 'fear-greed', sentiment: 100, vote: -1 },
  {
    label: 'fear_greed: no observation is missing data',
    ruleId: 'fear-greed',
    vote: 0,
    isMissing: true,
  },
];

function castCase(voteCase: VoteCase): { vote: number; isMissing: boolean } {
  const sentiment: SentimentObservation | null =
    voteCase.sentiment === undefined
      ? null
      : { value: voteCase.sentiment, observedAt: 1, source: 'alternative.me' };
  return API.castRuleVote({
    rule: ruleNamed(voteCase.ruleId),
    reading: { current: voteCase.current, previous: voteCase.previous },
    close: voteCase.close ?? DEFAULT_CLOSE,
    sentiment,
  });
}

describe('vote per rule kind (strict: only −1, 0 or +1)', () => {
  test.each(VOTE_CASES.map((voteCase) => [voteCase.label, voteCase] as const))(
    '%s',
    (_label, voteCase) => {
      expect(castCase(voteCase)).toStrictEqual({
        vote: voteCase.vote,
        isMissing: voteCase.isMissing ?? false,
      });
    },
  );

  test('the table covers every rule kind of the schema', () => {
    const covered = new Set(VOTE_CASES.map((voteCase) => ruleNamed(voteCase.ruleId).kind));
    expect([...covered].sort()).toStrictEqual(KINDS_CONFIG.rules.map((rule) => rule.kind).sort());
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

describe('missing indicator value after the warm-up is a typed error (only sentiment may be missing)', () => {
  const candleRuleIds = KINDS_CONFIG.rules
    .filter((rule) => rule.kind !== 'fear_greed')
    .map((rule) => rule.id);

  test.each(candleRuleIds.map((ruleId) => [ruleId] as const))(
    'rule %s without a value throws MISSING_VALUE',
    (ruleId) => {
      const run = (): unknown =>
        API.castRuleVote({
          rule: ruleNamed(ruleId),
          reading: { current: undefined, previous: DONCHIAN_PREVIOUS },
          close: DEFAULT_CLOSE,
          sentiment: null,
        });
      expect(codeOf(run)).toBe(INDICATOR_ERROR_CODE.MISSING_VALUE);
    },
  );

  test('a Donchian rule without the previous candle value throws MISSING_VALUE', () => {
    const run = (): unknown =>
      API.castRuleVote({
        rule: ruleNamed('donchian-20'),
        reading: { current: DONCHIAN_CURRENT, previous: undefined },
        close: DEFAULT_CLOSE,
        sentiment: null,
      });
    expect(codeOf(run)).toBe(INDICATOR_ERROR_CODE.MISSING_VALUE);
  });

  test('a scalar where the rule needs two outputs throws MISSING_VALUE', () => {
    const run = (): unknown =>
      API.castRuleVote({
        rule: ruleNamed('ema-9-21'),
        reading: { current: 10, previous: undefined },
        close: DEFAULT_CLOSE,
        sentiment: null,
      });
    expect(codeOf(run)).toBe(INDICATOR_ERROR_CODE.MISSING_VALUE);
  });
});

describe('regime by ADX and weights by family', () => {
  const adx = (value: number): IndicatorValue => ({ adx: value, plusDi: 20, minusDi: 10 });

  test.each([
    [25, 'trending'],
    [25.0001, 'trending'],
    [24.9999, 'ranging'],
    [24.96, 'ranging'],
    [0, 'ranging'],
    [100, 'trending'],
  ] as const)('ADX %p with threshold 25 is %s', (value, expected) => {
    expect(API.resolveRegime({ regime: CLASSIC_CONFIG.regime, adx: adx(value) })).toStrictEqual({
      regime: expected,
      adx: value,
    });
  });

  test('without a regime filter the regime is none and the ADX is not read', () => {
    expect(API.resolveRegime({ regime: FLAT_CONFIG.regime, adx: undefined })).toStrictEqual({
      regime: 'none',
      adx: null,
    });
  });

  test('an ADX regime without an ADX value throws MISSING_VALUE', () => {
    const run = (): unknown => API.resolveRegime({ regime: CLASSIC_CONFIG.regime, adx: undefined });
    expect(codeOf(run)).toBe(INDICATOR_ERROR_CODE.MISSING_VALUE);
  });

  const WEIGHT_CASES: readonly (readonly [Regime, StrategyFamily, string])[] = [
    ['trending', 'trend', '1.5'],
    ['trending', 'reversion', '0.5'],
    ['trending', 'volume', '1'],
    ['trending', 'sentiment', '1'],
    ['ranging', 'trend', '0.5'],
    ['ranging', 'reversion', '1.5'],
    ['ranging', 'volume', '1'],
    ['ranging', 'sentiment', '1'],
  ];

  test.each(WEIGHT_CASES)('in %s, the %s family weighs %s', (regime, family, weight) => {
    expect(API.resolveFamilyWeight({ regimeConfig: CLASSIC_CONFIG.regime, regime, family })).toBe(
      weight,
    );
  });

  test('without a regime filter every family weighs 1', () => {
    for (const family of ['trend', 'reversion', 'volume', 'sentiment'] as const) {
      expect(
        API.resolveFamilyWeight({ regimeConfig: FLAT_CONFIG.regime, regime: 'none', family }),
      ).toBe('1');
    }
  });
});

describe('the ADX shown in the reason is truncated to one decimal, never rounded up', () => {
  test.each([
    [24.96, '24.9'],
    [24.999999, '24.9'],
    [25, '25.0'],
    [25.04, '25.0'],
    [31.29, '31.2'],
    [31.199999999999996, '31.2'],
    [18.4, '18.4'],
    [0, '0.0'],
    [99.99, '99.9'],
    [100, '100.0'],
  ] as const)('%p is shown as %s', (value, text) => {
    expect(API.formatTruncatedAdx(value)).toBe(text);
  });
});
