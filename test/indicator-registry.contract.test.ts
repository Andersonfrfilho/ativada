// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeIndicatorSeries,
  computeLeadInCandles,
  createRuleIndicator,
  DONCHIAN_INDICATOR,
  EMA_INDICATOR,
  INDICATOR_REGISTRY,
  isCandleRule,
  MACD_INDICATOR,
  OBV_INDICATOR,
  parseStrategyConfig,
  restoreRuleIndicator,
  RSI_INDICATOR,
  RULE_KIND,
  BOLLINGER_INDICATOR,
  type CandleRule,
  type IndicatorCandle,
  type IndicatorHorizon,
  type IndicatorValue,
  type JsonValue,
  type StrategyConfigInput,
} from '../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { BTCUSDT_HOURLY_SERIES } from './fixtures/strategy-engine/oracle/oracle-market.fixture.js';

const CANDLES = BTCUSDT_HOURLY_SERIES.indicatorCandles;
const BOLLINGER_DEVIATIONS_TEXT = '2.3';

function buildConfigInput(): StrategyConfigInput {
  const classic = loadClassicScoreboard();
  return {
    ...classic,
    rules: [
      ...classic.rules,
      { id: 'donchian-20', kind: RULE_KIND.DONCHIAN_BREAKOUT, period: 20 },
      {
        id: 'bollinger-20',
        kind: RULE_KIND.BOLLINGER,
        period: 20,
        deviations: BOLLINGER_DEVIATIONS_TEXT,
      },
      { id: 'fear-greed', kind: RULE_KIND.FEAR_GREED, fearAtOrBelow: 25, greedAtOrAbove: 75 },
    ],
  };
}

const CONFIG = parseStrategyConfig(buildConfigInput());
const CANDLE_RULES: readonly CandleRule[] = CONFIG.rules.filter(isCandleRule);

function ruleNamed(id: string): CandleRule {
  const rule = CANDLE_RULES.find((entry) => entry.id === id);
  if (rule === undefined) throw new Error(`Regra ${id} ausente.`);
  return rule;
}

function runRule(rule: CandleRule): readonly (IndicatorValue | undefined)[] {
  const indicator = createRuleIndicator(rule);
  return CANDLES.map((candle) => indicator.update(candle));
}

function outputOf(value: IndicatorValue | undefined, output: string): number | undefined {
  if (value === undefined || typeof value === 'number') return undefined;
  return value[output];
}

describe('indicator registry, by rule kind', () => {
  test('has an entry for every rule kind that reads candles (not Fear & Greed)', () => {
    const candleKinds = Object.values(RULE_KIND).filter((kind) => kind !== RULE_KIND.FEAR_GREED);
    expect(Object.keys(INDICATOR_REGISTRY.rules).sort()).toStrictEqual([...candleKinds].sort());
    expect(CANDLE_RULES).toHaveLength(6);
    const fearGreed = CONFIG.rules.find((rule) => rule.kind === RULE_KIND.FEAR_GREED);
    expect(fearGreed !== undefined && isCandleRule(fearGreed)).toBe(false);
  });

  test('ema_cross runs the fast and the slow EMA of the rule', () => {
    const series = runRule(ruleNamed('ema-9-21'));
    const fast = computeIndicatorSeries({
      definition: EMA_INDICATOR,
      params: { period: 9 },
      candles: CANDLES,
    });
    const slow = computeIndicatorSeries({
      definition: EMA_INDICATOR,
      params: { period: 21 },
      candles: CANDLES,
    });
    series.forEach((value, index) => {
      expect(outputOf(value, 'slow')).toBe(slow[index]);
      if (value !== undefined) expect(outputOf(value, 'fast')).toBe(fast[index]);
    });
  });

  test('macd, donchian_breakout and rsi run the matching indicator with the rule periods', () => {
    const expected: readonly (readonly [string, readonly (IndicatorValue | undefined)[]])[] = [
      [
        'macd-12-26-9',
        computeIndicatorSeries({
          definition: MACD_INDICATOR,
          params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
          candles: CANDLES,
        }),
      ],
      [
        'donchian-20',
        computeIndicatorSeries({
          definition: DONCHIAN_INDICATOR,
          params: { period: 20 },
          candles: CANDLES,
        }),
      ],
      [
        'rsi-14',
        computeIndicatorSeries({
          definition: RSI_INDICATOR,
          params: { period: 14 },
          candles: CANDLES,
        }),
      ],
    ];
    for (const [id, series] of expected) {
      expect(JSON.stringify(runRule(ruleNamed(id)))).toBe(JSON.stringify(series));
    }
  });

  test('bollinger reads the decimal-text deviation as the number it spells', () => {
    const direct = computeIndicatorSeries({
      definition: BOLLINGER_INDICATOR,
      params: { period: 20, deviations: Number(BOLLINGER_DEVIATIONS_TEXT) },
      candles: CANDLES,
    });
    expect(JSON.stringify(runRule(ruleNamed('bollinger-20')))).toBe(JSON.stringify(direct));
  });

  test('obv_trend runs the OBV and the EMA of the OBV', () => {
    const obv = computeIndicatorSeries({ definition: OBV_INDICATOR, params: {}, candles: CANDLES });
    const obvAsCandles: IndicatorCandle[] = CANDLES.map((candle, index) => {
      const level = obv[index] ?? 0;
      return { ...candle, open: level, high: level, low: level, close: level };
    });
    const ema = computeIndicatorSeries({
      definition: EMA_INDICATOR,
      params: { period: 20 },
      candles: obvAsCandles,
    });
    runRule(ruleNamed('obv-ema-20')).forEach((value, index) => {
      expect(outputOf(value, 'ema')).toBe(ema[index]);
      if (value !== undefined) expect(outputOf(value, 'obv')).toBe(obv[index]);
    });
  });

  test('restoring a rule indicator from its snapshot resumes exactly', () => {
    for (const rule of CANDLE_RULES) {
      const original = createRuleIndicator(rule);
      CANDLES.slice(0, 150).forEach((candle) => original.update(candle));
      const snapshot = JSON.parse(JSON.stringify(original.snapshot())) as JsonValue;
      const restored = restoreRuleIndicator({ rule, snapshot });
      const resumed = CANDLES.slice(150).map((candle) => restored.update(candle));
      const continued = CANDLES.slice(150).map((candle) => original.update(candle));
      expect(JSON.stringify(resumed)).toBe(JSON.stringify(continued));
    }
  });

  test('risk uses the ATR period and regime uses the ADX period of the configuration', () => {
    expect(INDICATOR_REGISTRY.risk.create(CONFIG.risk).warmupCandles).toBe(CONFIG.risk.atrPeriod);
    if (CONFIG.regime.kind !== 'adx') throw new Error('Regime ADX esperado.');
    expect(INDICATOR_REGISTRY.regime.create(CONFIG.regime).warmupCandles).toBe(
      2 * CONFIG.regime.period - 1,
    );
  });

  test('the Placar clássico lead-in is 194 candles, set by the chained ADX', () => {
    if (CONFIG.regime.kind !== 'adx') throw new Error('Regime ADX esperado.');
    const horizons: IndicatorHorizon[] = [
      ...CANDLE_RULES.map((rule) => createRuleIndicator(rule)),
      INDICATOR_REGISTRY.risk.create(CONFIG.risk),
      INDICATOR_REGISTRY.regime.create(CONFIG.regime),
    ];
    expect(horizons.map((horizon) => horizon.convergenceCandles)).toStrictEqual([
      76, 129, 97, 73, 20, 20, 97, 194,
    ]);
    expect(computeLeadInCandles(horizons)).toBe(194);
  });
});
