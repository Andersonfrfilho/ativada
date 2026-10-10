// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  compareWithReference,
  DEFAULT_TOLERANCE,
  oracleSeriesToNumbers,
} from './fixtures/strategy-engine/oracle/oracle-comparison.fixture.js';
import {
  type OracleCandle,
  OracleDecimal,
  type OracleSeries,
} from './fixtures/strategy-engine/oracle/oracle-decimal.fixture.js';
import {
  BTCUSDT_HOURLY_SERIES,
  ETHUSDT_DAILY_SERIES,
  type MarketSeries,
  toOracleCandle,
} from './fixtures/strategy-engine/oracle/oracle-market.fixture.js';
import {
  ADX_SPEC,
  ATR_SPEC,
  BOLLINGER_SPEC,
  DONCHIAN_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  OBV_SPEC,
  RSI_SPEC,
  SMA_SPEC,
  VWAP_SPEC,
  ZSCORE_SPEC,
  type OracleSpec,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';
import {
  EDGE_SERIES,
  MONOTONE_FALL_SERIES,
  MONOTONE_RISE_SERIES,
  PLATEAU_SERIES,
  SYNTHETIC_EDGE_SERIES,
  ZERO_VOLUME_SERIES,
} from './fixtures/strategy-engine/oracle/oracle-synthetic.fixture.js';
import {
  nativeEma,
  nativeMacd,
} from './fixtures/strategy-engine/oracle/trading-signals-oracle.fixture.js';
import {
  HAND_CANDLES,
  HAND_EXPECTED,
  HAND_PERIOD,
} from './fixtures/strategy-engine/indicator-hand-values.fixture.js';
import {
  computeAdxOracle,
  computeAtrOracle,
  computeRsiOracle,
} from './fixtures/strategy-engine/oracle/oracle-momentum.fixture.js';
import {
  computeBollingerOracle,
  computeZScoreOracle,
} from './fixtures/strategy-engine/oracle/oracle-statistics.fixture.js';
import {
  computeDonchianOracle,
  computeEmaOracle,
  computeSmaOracle,
} from './fixtures/strategy-engine/oracle/oracle-trend.fixture.js';
import {
  computeObvOracle,
  computeVwapOracle,
} from './fixtures/strategy-engine/oracle/oracle-volume.fixture.js';

const REAL_SERIES: readonly MarketSeries[] = [BTCUSDT_HOURLY_SERIES, ETHUSDT_DAILY_SERIES];
const ALL_SPECS = [
  SMA_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  DONCHIAN_SPEC,
  RSI_SPEC,
  BOLLINGER_SPEC,
  ZSCORE_SPEC,
  VWAP_SPEC,
  OBV_SPEC,
  ATR_SPEC,
  ADX_SPEC,
] as const;
const LN_ONE_E_EIGHT = 18.420680743952367;

function firstDefinedIndex(series: OracleSeries): number {
  return series.findIndex((value) => value !== undefined);
}

describe('high-precision oracle: warmup agrees with the ADR table', () => {
  test.each(ALL_SPECS.map((spec) => [spec.name, spec] as const))('%s', (_name, spec) => {
    for (const market of [...REAL_SERIES, ...EDGE_SERIES]) {
      const series = spec.computeOracle(market.oracleCandles);
      expect(series).toHaveLength(market.oracleCandles.length);
      expect(firstDefinedIndex(series) + 1).toBe(spec.horizon.warmupCandles);
    }
  });
});

describe('high-precision oracle agrees with trading-signals (aligned conventions)', () => {
  test.each(
    ALL_SPECS.flatMap((spec) =>
      REAL_SERIES.map((market) => [spec.name, market.name, spec, market] as const),
    ),
  )('%s on %s', (_name, _marketName, spec: OracleSpec<unknown>, market) => {
    const comparison = compareWithReference({
      actual: oracleSeriesToNumbers(spec.computeOracle(market.oracleCandles)),
      expected: spec.computeReference?.(market.indicatorCandles) ?? [],
      fromIndex: spec.referenceFromIndex ?? 0,
    });
    expect(comparison.comparedCount).toBeGreaterThan(100);
    expect(comparison.maxError).toBeLessThan(DEFAULT_TOLERANCE);
  });
});

describe('native trading-signals EMA and MACD (seeded by the first price) converge to the ADR convention', () => {
  const settle = (period: number): number => Math.ceil(((period + 1) / 2) * LN_ONE_E_EIGHT);

  test('EMA(21) after warmup plus ceil((n+1)/2·ln 1e8) candles', () => {
    for (const market of REAL_SERIES) {
      const comparison = compareWithReference({
        actual: oracleSeriesToNumbers(computeEmaOracle(market.oracleCandles, { period: 21 })),
        expected: nativeEma({ candles: market.indicatorCandles, period: 21 }),
        fromIndex: 20 + settle(21),
      });
      expect(comparison.comparedCount).toBeGreaterThan(50);
      expect(comparison.maxError).toBeLessThan(DEFAULT_TOLERANCE);
    }
  });

  test('MACD(12, 26, 9) after both chained settling horizons', () => {
    const settledFrom = 25 + settle(26) + settle(9);
    const comparison = compareWithReference({
      actual: oracleSeriesToNumbers(MACD_SPEC.computeOracle(BTCUSDT_HOURLY_SERIES.oracleCandles)),
      expected: nativeMacd({
        candles: BTCUSDT_HOURLY_SERIES.indicatorCandles,
        ...MACD_SPEC.params,
      }),
      floorOf: ({ index }) => BTCUSDT_HOURLY_SERIES.indicatorCandles[index]?.close ?? 0,
      fromIndex: settledFrom,
    });
    expect(comparison.comparedCount).toBeGreaterThan(300);
    expect(comparison.maxError).toBeLessThan(DEFAULT_TOLERANCE);
  });

  test('the seeds really differ at the first value (the difference is the convention, not noise)', () => {
    const closes = BTCUSDT_HOURLY_SERIES.indicatorCandles;
    const ours = oracleSeriesToNumbers(
      computeEmaOracle(BTCUSDT_HOURLY_SERIES.oracleCandles, { period: 21 }),
    );
    const theirs = nativeEma({ candles: closes, period: 21 });
    expect(Math.abs((ours[20]?.value ?? 0) - (theirs[20]?.value ?? 0))).toBeGreaterThan(1);
  });
});

describe('hand-computed values (SMA, EMA, RSI, ATR of period 3; OBV; Donchian; VWAP; Bollinger)', () => {
  const candles: readonly OracleCandle[] = HAND_CANDLES.map((candle) =>
    toOracleCandle([
      candle.openTime,
      String(candle.open),
      String(candle.high),
      String(candle.low),
      String(candle.close),
      String(candle.volume),
    ]),
  );
  const period = { period: HAND_PERIOD };
  const oracleCases: readonly (readonly [string, OracleSeries])[] = [
    ['sma', computeSmaOracle(candles, period)],
    ['ema', computeEmaOracle(candles, period)],
    ['rsi', computeRsiOracle(candles, period)],
    ['atr', computeAtrOracle(candles, period)],
    ['obv', computeObvOracle(candles)],
    ['vwap', computeVwapOracle(candles)],
    ['zScore', computeZScoreOracle(candles, period)],
    ['donchian', computeDonchianOracle(candles, period)],
    ['bollinger', computeBollingerOracle(candles, { period: HAND_PERIOD, deviations: '2' })],
  ];

  test.each(oracleCases)('%s', (name, series) => {
    const comparison = compareWithReference({
      actual: oracleSeriesToNumbers(series),
      expected: HAND_EXPECTED[name] ?? [],
    });
    expect(comparison.maxError).toBeLessThan(1e-14);
    expect(comparison.comparedCount).toBeGreaterThan(0);
  });
});

describe('oracle borders on the edge series', () => {
  const valueAt = (series: OracleSeries, index: number, output = 'value'): number =>
    series[index]?.[output]?.toNumber() ?? Number.NaN;
  const last = (market: MarketSeries): number => market.oracleCandles.length - 1;

  test('RSI is 100 without losses, 0 without gains and 50 on a plateau', () => {
    const rise = computeRsiOracle(MONOTONE_RISE_SERIES.oracleCandles, { period: 14 });
    const fall = computeRsiOracle(MONOTONE_FALL_SERIES.oracleCandles, { period: 14 });
    const flat = computeRsiOracle(PLATEAU_SERIES.oracleCandles, { period: 14 });
    expect(valueAt(rise, 14)).toBe(100);
    expect(valueAt(rise, last(MONOTONE_RISE_SERIES))).toBe(100);
    expect(valueAt(fall, last(MONOTONE_FALL_SERIES))).toBe(0);
    expect(valueAt(flat, last(PLATEAU_SERIES))).toBe(50);
  });

  test('a plateau has zero deviation, zero z-score, zero width, zero ATR and zero DI', () => {
    const candles = PLATEAU_SERIES.oracleCandles;
    const end = last(PLATEAU_SERIES);
    expect(valueAt(computeZScoreOracle(candles, { period: 20 }), end)).toBe(0);
    const bands = computeBollingerOracle(candles, { period: 20, deviations: '2' });
    expect(valueAt(bands, end, 'width')).toBe(0);
    expect(valueAt(bands, end, 'upper')).toBe(valueAt(bands, end, 'middle'));
    expect(valueAt(computeAtrOracle(candles, { period: 14 }), end)).toBe(0);
    const adx = computeAdxOracle(candles, { period: 14 });
    expect(['adx', 'plusDi', 'minusDi'].map((output) => valueAt(adx, end, output))).toStrictEqual([
      0, 0, 0,
    ]);
    expect(valueAt(computeObvOracle(candles), end)).toBe(0);
  });

  test('with zero volume in the whole session the VWAP is the typical price of the candle', () => {
    const candles = ZERO_VOLUME_SERIES.oracleCandles;
    const vwap = computeVwapOracle(candles);
    candles.forEach((candle, index) => {
      const typical = candle.high.plus(candle.low).plus(candle.close).dividedBy(3);
      expect(vwap[index]?.value?.equals(typical)).toBe(true);
    });
  });

  test('Donchian of period 1 is the candle itself', () => {
    const candles = SYNTHETIC_EDGE_SERIES.oracleCandles;
    const channel = computeDonchianOracle(candles, { period: 1 });
    expect(channel[7]?.upper?.equals(candles[7]?.high ?? 0)).toBe(true);
    expect(channel[7]?.lower?.equals(candles[7]?.low ?? 0)).toBe(true);
  });

  test('the oracle keeps 40 digits: 1/3 does not collapse to a double', () => {
    expect(new OracleDecimal(1).dividedBy(3).toString()).toHaveLength(42);
  });
});
