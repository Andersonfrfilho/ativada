// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { INDICATOR_ERROR_CODE, IndicatorError } from '../packages/strategy-engine/src/index.js';
import {
  adx,
  ADX_FORMAT_CASES,
  castCase,
  DEFAULT_CLOSE,
  DONCHIAN_CURRENT,
  DONCHIAN_PREVIOUS,
  REGIME_CASES,
  ruleNamed,
  VOTE_CASES,
  WEIGHT_CASES,
} from './fixtures/strategy-engine/signal/rule-cases.fixture.js';
import {
  CLASSIC_CONFIG,
  FLAT_CONFIG,
  KINDS_CONFIG,
} from './fixtures/strategy-engine/signal/scoreboard-configs.fixture.js';
import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';

const API = PRODUCTION_SIGNAL_API;

describe('vote per rule kind (strict: only −1, 0 or +1)', () => {
  test.each(VOTE_CASES.map((voteCase) => [voteCase.label, voteCase] as const))(
    '%s',
    (_label, voteCase) => {
      expect(castCase(API, voteCase)).toStrictEqual({
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
  test.each(REGIME_CASES)('ADX %p with threshold 25 is %s', (value, expected) => {
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
  test.each(ADX_FORMAT_CASES)('%p is shown as %s', (value, text) => {
    expect(API.formatTruncatedAdx(value)).toBe(text);
  });
});
