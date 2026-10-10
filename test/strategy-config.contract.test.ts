// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createStrategyVersion,
  hashStrategyConfig,
  MAX_STRATEGY_RULES,
  MAX_WALK_FORWARD_COMBINATIONS,
  parseStrategyConfig,
  StrategyConfigError,
  type StrategyConfig,
} from '../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const MINIMAL_CONFIG = {
  schemaVersion: 1,
  market: { symbol: 'ETHUSDT', timeframe: '4h' },
  rules: [{ id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 }],
  thresholds: { buy: '1', sell: '-1' },
};

function captureIssues(input: unknown): readonly { path: string; message: string }[] {
  try {
    parseStrategyConfig(input);
  } catch (error) {
    if (error instanceof StrategyConfigError) return error.issues;
    throw error;
  }
  throw new Error('A configuração deveria ter sido recusada.');
}

function issuePaths(input: unknown): readonly string[] {
  return captureIssues(input).map((issue) => issue.path);
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

describe('strategy config schema', () => {
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
    expect(config.execution).toStrictEqual({
      initialBalance: '10000',
      feeRate: '0.001',
      slippageRate: '0.0005',
      tickSize: '0.01',
      quantityStep: '0.00001',
      minNotional: '5',
    });
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
      market: { symbol: 'BTCBRL', timeframe: '5m' },
      rules: [
        { id: 'ema', kind: 'ema_cross', fastPeriod: 21, slowPeriod: 9 },
        { id: 'ema', kind: 'rsi', period: 14, oversold: 70, overbought: 30 },
      ],
      thresholds: { buy: '-1', sell: '1' },
      execution: { feeRate: 0.001, slippageRate: '1e-3' },
    });
    for (const expectedPath of [
      'market.symbol',
      'market.timeframe',
      'rules.0.fastPeriod',
      'rules.1.oversold',
      'rules.1.id',
      'thresholds.buy',
      'thresholds.sell',
      'execution.feeRate',
      'execution.slippageRate',
    ]) {
      expect(paths).toContain(expectedPath);
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
    expect(captureIssues({ ...classic, name: 'Placar' })[0]?.message).toContain('Unrecognized key');
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
    expect(issuePaths({ ...MINIMAL_CONFIG, execution: { feeRate: '0.02' } })).toContain(
      'execution.feeRate',
    );
    expect(MAX_WALK_FORWARD_COMBINATIONS).toBe(200);
  });

  test('parsing does not mutate the input', () => {
    const input = structuredClone(MINIMAL_CONFIG);
    parseStrategyConfig(input);
    expect(input).toStrictEqual(MINIMAL_CONFIG);
  });
});

describe('strategy config hash', () => {
  test('is a stable SHA-256 of the canonical JSON', () => {
    const version = createStrategyVersion(loadClassicScoreboard());
    expect(version.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(createStrategyVersion(loadClassicScoreboard()).configHash).toBe(version.configHash);
    expect(createStrategyVersion(reverseKeys(loadClassicScoreboard())).configHash).toBe(
      version.configHash,
    );
  });

  test('equivalent spellings and omitted defaults give the same hash', () => {
    const explicit = parseStrategyConfig({
      ...MINIMAL_CONFIG,
      execution: { feeRate: '0.0010', slippageRate: '0.00050', initialBalance: '10000.00' },
    });
    expect(hashStrategyConfig(explicit)).toBe(
      hashStrategyConfig(parseStrategyConfig(MINIMAL_CONFIG)),
    );
    const handBuilt = { ...explicit, thresholds: { buy: '1.000', sell: '-1.0' } };
    expect(hashStrategyConfig(handBuilt)).toBe(hashStrategyConfig(explicit));
  });

  test('any change in meaning gives a new hash (a new version)', () => {
    const base = hashStrategyConfig(parseStrategyConfig(loadClassicScoreboard()));
    const classic = loadClassicScoreboard();
    const variants: readonly unknown[] = [
      { ...classic, execution: { ...classic.execution, feeRate: '0.002' } },
      { ...classic, thresholds: { buy: '2.5', sell: '-2' } },
      { ...classic, rules: [...classic.rules].reverse() },
      { ...classic, market: { symbol: 'ETHUSDT', timeframe: '1h' } },
    ];
    const hashes = variants.map((variant) => hashStrategyConfig(parseStrategyConfig(variant)));
    expect(new Set([base, ...hashes]).size).toBe(variants.length + 1);
  });
});
