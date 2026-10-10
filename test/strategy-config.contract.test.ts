// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  canonicalJson,
  createRunSetup,
  createStrategyVersion,
  hashRunParameters,
  hashStrategyConfig,
  MAX_STRATEGY_RULES,
  MAX_WALK_FORWARD_COMBINATIONS,
  parseRunParameters,
  parseStrategyConfig,
  RunParametersError,
  StrategyConfigError,
  type StrategyConfig,
} from '../packages/strategy-engine/src/index.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const MINIMAL_CONFIG = {
  schemaVersion: 1,
  rules: [{ id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 }],
  thresholds: { buy: '1', sell: '-1' },
};
const MINIMAL_RUN = {
  schemaVersion: 1,
  symbol: 'ETHUSDT',
  timeframe: '4h',
  sentimentSource: 'alternative.me',
};

// Hash-dourado literal: mudar a semântica do Zod (defaults, transformações) ou do JSON canônico muda
// o hash de toda versão gravada — o teste avisa antes que isso chegue ao banco.
const CLASSIC_CONFIG_HASH = '7dc257e634968692b36421cc67c92a41ccbb17b6138299cc5a50ab246af56df8';
const MINIMAL_CONFIG_HASH = '71129208a8f4550a83f15fb22f78c8c834b2c0ddc9351fb5729516fb275f073a';
const MINIMAL_CONFIG_CANONICAL =
  '{"entry":{"orderType":"market"},"regime":{"kind":"none"},"risk":{"atrPeriod":14,"maxExposureRate":"1","riskPerTrade":"0.01","stopAtrMultiple":"2","targetAtrMultiple":"3"},"rules":[{"id":"rsi-14","kind":"rsi","overbought":70,"oversold":30,"period":14}],"schemaVersion":1,"thresholds":{"buy":"1","sell":"-1"}}';
const CLASSIC_RUN_HASH = 'da96318e37bca44a9ec657c3bf58cd09ba487137299cec7ed5bc12926657b079';
const MINIMAL_RUN_HASH = '105ad94998ccc797493e985523bb7f545aea54197c4dd4be50b414c49e9e241f';

function captureIssues(parse: () => unknown): readonly { path: string; message: string }[] {
  try {
    parse();
  } catch (error) {
    if (error instanceof StrategyConfigError || error instanceof RunParametersError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error('A entrada deveria ter sido recusada.');
}

function issuePaths(input: unknown): readonly string[] {
  return captureIssues(() => parseStrategyConfig(input)).map((issue) => issue.path);
}

function runIssuePaths(input: unknown): readonly string[] {
  return captureIssues(() => parseRunParameters(input)).map((issue) => issue.path);
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, member]) => [key, reverseKeys(member)]),
  );
}

describe('strategy config schema (the version is the logic only)', () => {
  test('the classic scoreboard of plan §4 is a valid config and parses to itself', () => {
    const input = loadClassicScoreboard();
    expect(parseStrategyConfig(input)).toStrictEqual(input as StrategyConfig);
  });

  test('a minimal config receives safe defaults', () => {
    const config = parseStrategyConfig(MINIMAL_CONFIG);
    expect(config.regime).toStrictEqual({ kind: 'none' });
    expect(config.entry).toStrictEqual({ orderType: 'market' });
    expect(config.risk).toStrictEqual({
      atrPeriod: 14,
      stopAtrMultiple: '2',
      targetAtrMultiple: '3',
      riskPerTrade: '0.01',
      maxExposureRate: '1',
    });
  });

  test('pair, timeframe, balance, fee, slippage and filters are not part of the version', () => {
    const classic = loadClassicScoreboard();
    expect(issuePaths({ ...classic, market: { symbol: 'BTCUSDT', timeframe: '1h' } })).toContain(
      '',
    );
    expect(issuePaths({ ...classic, execution: { feeRate: '0.001' } })).toContain('');
  });

  test('an ADX regime without weights receives the classic weights', () => {
    const config = parseStrategyConfig({ ...MINIMAL_CONFIG, regime: { kind: 'adx' } });
    expect(config.regime).toStrictEqual({
      kind: 'adx',
      period: 14,
      trendThreshold: 25,
      weights: {
        trending: { trend: '1.5', reversion: '0.5', volume: '1', sentiment: '1' },
        ranging: { trend: '0.5', reversion: '1.5', volume: '1', sentiment: '1' },
      },
    });
  });

  test('every problem is reported at once', () => {
    const paths = issuePaths({
      schemaVersion: 1,
      rules: [
        { id: 'ema', kind: 'ema_cross', fastPeriod: 21, slowPeriod: 9 },
        { id: 'ema', kind: 'rsi', period: 14, oversold: 70, overbought: 30 },
      ],
      thresholds: { buy: '-1', sell: '1' },
      risk: { riskPerTrade: 0.01, stopAtrMultiple: '1e-3' },
    });
    for (const expectedPath of [
      'rules.0.fastPeriod',
      'rules.1.oversold',
      'rules.1.id',
      'thresholds.buy',
      'thresholds.sell',
      'risk.riskPerTrade',
      'risk.stopAtrMultiple',
    ]) {
      expect(paths).toContain(expectedPath);
    }
  });

  test('Bollinger deviations are decimal text with one place, never a float multipleOf', () => {
    const rule = { id: 'bollinger-20', kind: 'bollinger', period: 20 };
    const parse = (deviations: unknown): unknown =>
      parseStrategyConfig({ ...MINIMAL_CONFIG, rules: [{ ...rule, deviations }] });
    expect(parse('2.3')).toMatchObject({ rules: [{ deviations: '2.3' }] });
    expect(parse('2.0')).toMatchObject({ rules: [{ deviations: '2' }] });
    for (const invalid of ['2.25', 2.3, '0.4', '5.1']) {
      expect(
        issuePaths({ ...MINIMAL_CONFIG, rules: [{ ...rule, deviations: invalid }] }),
      ).toContain('rules.0.deviations');
    }
  });

  test('unknown keys are rejected at every level (strict)', () => {
    const classic = loadClassicScoreboard();
    const paths = issuePaths({
      ...classic,
      name: 'Placar',
      risk: { ...classic.risk, leverage: '3' },
      rules: [{ ...MINIMAL_CONFIG.rules[0], label: 'RSI' }],
    });
    expect(
      captureIssues(() => parseStrategyConfig({ ...classic, name: 'Placar' }))[0]?.message,
    ).toContain('Unrecognized key');
    for (const expectedPath of ['', 'risk', 'rules.0']) expect(paths).toContain(expectedPath);
  });

  test('the schema version is explicit and only version 1 is accepted', () => {
    const withoutVersion = Object.fromEntries(
      Object.entries(MINIMAL_CONFIG).filter(([key]) => key !== 'schemaVersion'),
    );
    expect(issuePaths(withoutVersion)).toContain('schemaVersion');
    expect(issuePaths({ ...MINIMAL_CONFIG, schemaVersion: 2 })).toContain('schemaVersion');
  });

  test('limits: rule count, decimal bounds and walk-forward ceiling', () => {
    const rules = Array.from({ length: MAX_STRATEGY_RULES + 1 }, (_unused, index) => ({
      id: `donchian-${index}`,
      kind: 'donchian_breakout',
      period: 20,
    }));
    expect(issuePaths({ ...MINIMAL_CONFIG, rules })).toContain('rules');
    expect(issuePaths({ ...MINIMAL_CONFIG, risk: { riskPerTrade: '0.5' } })).toContain(
      'risk.riskPerTrade',
    );
    expect(MAX_WALK_FORWARD_COMBINATIONS).toBe(200);
  });

  test('parsing does not mutate the input', () => {
    const input = structuredClone(MINIMAL_CONFIG);
    parseStrategyConfig(input);
    expect(input).toStrictEqual(MINIMAL_CONFIG);
  });
});

describe('run parameters schema', () => {
  test('the example run parameters parse to themselves; a minimal one receives the BTCUSDT filters', () => {
    const example = loadClassicRunParameters();
    expect(parseRunParameters(example)).toStrictEqual(
      example as ReturnType<typeof parseRunParameters>,
    );
    expect(parseRunParameters(MINIMAL_RUN)).toStrictEqual({
      schemaVersion: 1,
      symbol: 'ETHUSDT',
      timeframe: '4h',
      sentimentSource: 'alternative.me',
      initialBalance: '10000',
      feeRate: '0.001',
      slippageRate: '0.0005',
      tickSize: '0.01',
      quantityStep: '0.00001',
      minNotional: '5',
      maxVolumeShare: '0.01',
    });
  });

  test('every problem is reported at once, balance capped at 1e9 (numeric(24,8))', () => {
    const paths = runIssuePaths({
      schemaVersion: 1,
      symbol: 'BTCBRL',
      timeframe: '5m',
      initialBalance: '1000000000.01',
      feeRate: 0.001,
      slippageRate: '1e-3',
      maxVolumeShare: '0',
      extra: true,
    });
    for (const expectedPath of [
      'symbol',
      'timeframe',
      'sentimentSource',
      'initialBalance',
      'feeRate',
      'slippageRate',
      'maxVolumeShare',
      '',
    ]) {
      expect(paths).toContain(expectedPath);
    }
    expect(
      parseRunParameters({ ...MINIMAL_RUN, initialBalance: '1000000000' }).initialBalance,
    ).toBe('1000000000');
  });
});

describe('run parameters: sentiment source', () => {
  test('is mandatory, non-empty and at most 64 characters (the observation source is an identifier)', () => {
    const withoutSource = Object.fromEntries(
      Object.entries(MINIMAL_RUN).filter(([key]) => key !== 'sentimentSource'),
    );
    expect(runIssuePaths(withoutSource)).toContain('sentimentSource');
    expect(runIssuePaths({ ...MINIMAL_RUN, sentimentSource: '' })).toContain('sentimentSource');
    expect(runIssuePaths({ ...MINIMAL_RUN, sentimentSource: 'x'.repeat(65) })).toContain(
      'sentimentSource',
    );
    expect(parseRunParameters({ ...MINIMAL_RUN, sentimentSource: 'x'.repeat(64) })).toBeDefined();
  });
});

describe('version and run hashes', () => {
  test('are SHA-256 of the canonical JSON, pinned by golden literals', () => {
    expect(createStrategyVersion(loadClassicScoreboard()).configHash).toBe(CLASSIC_CONFIG_HASH);
    expect(canonicalJson(parseStrategyConfig(MINIMAL_CONFIG))).toBe(MINIMAL_CONFIG_CANONICAL);
    expect(createStrategyVersion(MINIMAL_CONFIG).configHash).toBe(MINIMAL_CONFIG_HASH);
    expect(createRunSetup(loadClassicRunParameters()).runHash).toBe(CLASSIC_RUN_HASH);
    expect(createRunSetup(MINIMAL_RUN).runHash).toBe(MINIMAL_RUN_HASH);
  });

  test('key order, equivalent spellings and omitted defaults give the same hash', () => {
    expect(createStrategyVersion(reverseKeys(loadClassicScoreboard())).configHash).toBe(
      CLASSIC_CONFIG_HASH,
    );
    const explicit = parseStrategyConfig({
      ...MINIMAL_CONFIG,
      risk: { riskPerTrade: '0.010', stopAtrMultiple: '2.0' },
    });
    expect(hashStrategyConfig(explicit)).toBe(MINIMAL_CONFIG_HASH);
    const spelled = parseRunParameters({
      ...MINIMAL_RUN,
      feeRate: '0.0010',
      initialBalance: '10000.00',
    });
    expect(hashRunParameters(spelled)).toBe(MINIMAL_RUN_HASH);
  });

  test('any change in meaning gives a new hash; run parameters never touch the version hash', () => {
    const classic = loadClassicScoreboard();
    const variants: readonly unknown[] = [
      { ...classic, thresholds: { buy: '2.5', sell: '-2' } },
      { ...classic, rules: [...classic.rules].reverse() },
      { ...classic, risk: { ...classic.risk, riskPerTrade: '0.02' } },
    ];
    const hashes = variants.map((variant) => hashStrategyConfig(parseStrategyConfig(variant)));
    expect(new Set([CLASSIC_CONFIG_HASH, ...hashes]).size).toBe(variants.length + 1);
    const example = loadClassicRunParameters();
    const runVariants = [
      { ...example, feeRate: '0.002' },
      { ...example, symbol: 'ETHUSDT' },
      { ...example, initialBalance: '500' },
      { ...example, maxVolumeShare: '0.05' },
      { ...example, sentimentSource: 'alternative.me/live' },
    ];
    const runHashes = runVariants.map((variant) => createRunSetup(variant).runHash);
    expect(new Set([CLASSIC_RUN_HASH, ...runHashes]).size).toBe(runVariants.length + 1);
  });
});
