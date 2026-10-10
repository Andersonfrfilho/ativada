// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ADX_INDICATOR,
  ATR_INDICATOR,
  BOLLINGER_INDICATOR,
  computeIndicatorSeries,
  DONCHIAN_INDICATOR,
  EMA_CROSS_INDICATOR,
  EMA_INDICATOR,
  INDICATOR_ERROR_CODE,
  IndicatorError,
  MACD_INDICATOR,
  OBV_INDICATOR,
  OBV_TREND_INDICATOR,
  RSI_INDICATOR,
  SMA_INDICATOR,
  VWAP_INDICATOR,
  Z_SCORE_INDICATOR,
  type Indicator,
  type IndicatorCandle,
  type IndicatorDefinition,
  type IndicatorErrorCode,
  type IndicatorValue,
  type JsonValue,
} from '../packages/strategy-engine/src/index.js';
import {
  ADX_SPEC,
  ATR_SPEC,
  BOLLINGER_SPEC,
  DONCHIAN_SPEC,
  EMA_CROSS_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  OBV_SPEC,
  OBV_TREND_SPEC,
  RSI_SPEC,
  SMA_SPEC,
  VWAP_SPEC,
  ZSCORE_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';
import {
  MONOTONE_FALL_SERIES,
  MONOTONE_RISE_SERIES,
  PLATEAU_SERIES,
  ZERO_VOLUME_SERIES,
} from './fixtures/strategy-engine/oracle/oracle-synthetic.fixture.js';

type BorderCase = {
  readonly name: string;
  readonly create: () => Indicator<IndicatorValue>;
  readonly restore: (snapshot: JsonValue) => Indicator<IndicatorValue>;
  readonly run: (candles: readonly IndicatorCandle[]) => readonly (IndicatorValue | undefined)[];
};

function borderCase<TParams, TValue extends IndicatorValue>(
  name: string,
  definition: IndicatorDefinition<TParams, TValue>,
  params: TParams,
): BorderCase {
  return {
    name,
    create: () => definition.create(params),
    restore: (snapshot) => definition.restore({ params, snapshot }),
    run: (candles) => computeIndicatorSeries({ definition, params, candles }),
  };
}

const PERIOD_INDICATORS = [
  borderCase('sma', SMA_INDICATOR, SMA_SPEC.params),
  borderCase('ema', EMA_INDICATOR, EMA_SPEC.params),
  borderCase('macd', MACD_INDICATOR, MACD_SPEC.params),
  borderCase('donchian', DONCHIAN_INDICATOR, DONCHIAN_SPEC.params),
  borderCase('rsi', RSI_INDICATOR, RSI_SPEC.params),
  borderCase('bollinger', BOLLINGER_INDICATOR, BOLLINGER_SPEC.params),
  borderCase('z-score', Z_SCORE_INDICATOR, ZSCORE_SPEC.params),
  borderCase('atr', ATR_INDICATOR, ATR_SPEC.params),
  borderCase('adx', ADX_INDICATOR, ADX_SPEC.params),
  borderCase('vwap', VWAP_INDICATOR, VWAP_SPEC.params),
  borderCase('obv', OBV_INDICATOR, OBV_SPEC.params),
  borderCase('ema-cross', EMA_CROSS_INDICATOR, EMA_CROSS_SPEC.params),
  borderCase('obv-trend', OBV_TREND_INDICATOR, OBV_TREND_SPEC.params),
] as const;

const VALID_CANDLE: IndicatorCandle = {
  openTime: 1_735_689_600_000,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 10,
};

function codeOf(action: () => unknown): IndicatorErrorCode | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof IndicatorError) return error.code;
    throw error;
  }
  return undefined;
}

function corruptCandle(overrides: Record<string, unknown>): IndicatorCandle {
  return { ...VALID_CANDLE, ...overrides };
}

const BAD_CANDLES: readonly (readonly [string, IndicatorCandle])[] = [
  ['NaN close', corruptCandle({ close: Number.NaN })],
  ['Infinity high', corruptCandle({ high: Number.POSITIVE_INFINITY })],
  ['-Infinity low', corruptCandle({ low: Number.NEGATIVE_INFINITY })],
  ['missing open', corruptCandle({ open: undefined })],
  ['missing volume', corruptCandle({ volume: undefined })],
  ['string close', corruptCandle({ close: '100' })],
  ['negative volume', corruptCandle({ volume: -1 })],
  ['fractional open time', corruptCandle({ openTime: 1.5 })],
  ['missing open time', corruptCandle({ openTime: undefined })],
];

describe('missing or non-finite data is a typed error, never a silent NaN', () => {
  test.each(
    PERIOD_INDICATORS.flatMap((entry) =>
      BAD_CANDLES.map((bad) => [entry.name, bad[0], entry, bad[1]] as const),
    ),
  )('%s rejects %s', (_name, _label, entry, candle) => {
    const indicator = entry.create();
    expect(codeOf(() => indicator.update(candle))).toBe(INDICATOR_ERROR_CODE.INVALID_CANDLE);
  });

  test.each(PERIOD_INDICATORS.map((entry) => [entry.name, entry] as const))(
    '%s keeps its state when a candle is refused',
    (_name, entry) => {
      const candles = BTC_LIKE_CANDLES;
      const clean = entry.run(candles);
      const indicator = entry.create();
      const resumed = candles.map((candle, index) => {
        if (index % 7 === 3)
          expect(
            codeOf(() => indicator.update(corruptCandle({ close: Number.NaN }))),
          ).toBeDefined();
        return indicator.update(candle);
      });
      expect(JSON.stringify(resumed)).toBe(JSON.stringify(clean));
    },
  );
});

const BTC_LIKE_CANDLES: readonly IndicatorCandle[] = MONOTONE_RISE_SERIES.indicatorCandles.map(
  (candle, index) => ({
    ...candle,
    close: candle.close + (index % 5),
    high: candle.high + 5,
    low: candle.low - 5,
  }),
);

describe('invalid parameters are refused when the indicator is created', () => {
  const BAD_PERIODS = [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY] as const;
  const CREATORS: readonly (readonly [string, (period: number) => unknown])[] = [
    ['sma', (period): unknown => SMA_INDICATOR.create({ period })],
    ['ema', (period): unknown => EMA_INDICATOR.create({ period })],
    ['donchian', (period): unknown => DONCHIAN_INDICATOR.create({ period })],
    ['rsi', (period): unknown => RSI_INDICATOR.create({ period })],
    ['z-score', (period): unknown => Z_SCORE_INDICATOR.create({ period })],
    ['atr', (period): unknown => ATR_INDICATOR.create({ period })],
    ['adx', (period): unknown => ADX_INDICATOR.create({ period })],
    ['obv-trend', (period): unknown => OBV_TREND_INDICATOR.create({ emaPeriod: period })],
  ];

  test.each(
    BAD_PERIODS.flatMap((period) =>
      CREATORS.map(([name, create]) => [name, period, create] as const),
    ),
  )('%s period %p', (_name, period, create) => {
    expect(codeOf(() => create(period))).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
  });

  test('MACD needs fast < slow and valid periods', () => {
    const create = (
      fastPeriod: number,
      slowPeriod: number,
      signalPeriod: number,
    ): IndicatorErrorCode | undefined =>
      codeOf(() => MACD_INDICATOR.create({ fastPeriod, slowPeriod, signalPeriod }));
    expect(create(26, 12, 9)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(12, 12, 9)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(12, 26, 0)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(12, 26, 9)).toBeUndefined();
  });

  test('Bollinger needs a finite positive deviation multiple', () => {
    const create = (deviations: number): IndicatorErrorCode | undefined =>
      codeOf(() => BOLLINGER_INDICATOR.create({ period: 20, deviations }));
    expect(create(0)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(-2)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(Number.NaN)).toBe(INDICATOR_ERROR_CODE.INVALID_PARAMETER);
    expect(create(2.3)).toBeUndefined();
  });
});

describe("a snapshot that is not the indicator's own is refused", () => {
  const CORRUPT_SNAPSHOTS: readonly (readonly [string, JsonValue])[] = [
    ['null', null],
    ['text', 'window'],
    ['empty object', {}],
    ['array', [1, 2, 3]],
    ['number where a window is expected', { window: 7, highs: 7, lows: 7, fast: 7 }],
    ['non-numeric window', { window: ['x'], highs: ['x'], lows: ['x'], seed: ['x'], value: 'x' }],
  ];

  test.each(
    PERIOD_INDICATORS.flatMap((entry) =>
      CORRUPT_SNAPSHOTS.map((bad) => [entry.name, bad[0], entry, bad[1]] as const),
    ),
  )('%s refuses %s', (_name, _label, entry, snapshot) => {
    expect(codeOf(() => entry.restore(snapshot))).toBe(INDICATOR_ERROR_CODE.INVALID_SNAPSHOT);
  });

  test('a window longer than the period is refused', () => {
    const snapshot = {
      window: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    };
    expect(codeOf(() => SMA_INDICATOR.restore({ params: { period: 20 }, snapshot }))).toBe(
      INDICATOR_ERROR_CODE.INVALID_SNAPSHOT,
    );
  });
});

describe('RSI borders', () => {
  const lastOf = (series: readonly (number | undefined)[]): number | undefined =>
    series[series.length - 1];
  const rsiOf = (candles: readonly IndicatorCandle[]): readonly (number | undefined)[] =>
    computeIndicatorSeries({ definition: RSI_INDICATOR, params: { period: 14 }, candles });

  test('without losses it is exactly 100', () => {
    const series = rsiOf(MONOTONE_RISE_SERIES.indicatorCandles);
    expect(series[14]).toBe(100);
    expect(lastOf(series)).toBe(100);
  });

  test('without gains it is exactly 0', () => {
    expect(lastOf(rsiOf(MONOTONE_FALL_SERIES.indicatorCandles))).toBe(0);
  });

  test('without gains and without losses (plateau) it is the neutral 50', () => {
    expect(lastOf(rsiOf(PLATEAU_SERIES.indicatorCandles))).toBe(50);
  });
});

describe('deviation borders (Bollinger and z-score)', () => {
  const flatCandles = (price: number): IndicatorCandle[] =>
    PLATEAU_SERIES.indicatorCandles.map((candle) => ({
      ...candle,
      open: price,
      high: price,
      low: price,
      close: price,
    }));

  test.each([100, 0.1, 0.3, 27_123.45])(
    'a flat window at %p has zero deviation, z-score 0 and width 0',
    (price) => {
      const candles = flatCandles(price);
      const bands = computeIndicatorSeries({
        definition: BOLLINGER_INDICATOR,
        params: { period: 20, deviations: 2 },
        candles,
      });
      const zScores = computeIndicatorSeries({
        definition: Z_SCORE_INDICATOR,
        params: { period: 20 },
        candles,
      });
      expect(bands[59]).toStrictEqual({ lower: price, middle: price, upper: price, width: 0 });
      expect(zScores[59]).toBe(0);
    },
  );

  test('Donchian of period 1 is the high and the low of the candle', () => {
    const candles = BTC_LIKE_CANDLES;
    const series = computeIndicatorSeries({
      definition: DONCHIAN_INDICATOR,
      params: { period: 1 },
      candles,
    });
    series.forEach((value, index) => {
      expect(value).toStrictEqual({
        upper: candles[index]?.high ?? Number.NaN,
        lower: candles[index]?.low ?? Number.NaN,
      });
    });
  });
});

describe('ATR, ADX, OBV and VWAP borders', () => {
  const lastOf = <TValue>(series: readonly (TValue | undefined)[]): TValue | undefined =>
    series[series.length - 1];
  const run = <TParams, TValue extends IndicatorValue>(
    definition: IndicatorDefinition<TParams, TValue>,
    params: TParams,
    candles: readonly IndicatorCandle[],
  ): readonly (TValue | undefined)[] => computeIndicatorSeries({ definition, params, candles });

  test('a plateau has zero ATR, zero DI and zero ADX, and no change in the OBV', () => {
    const candles = PLATEAU_SERIES.indicatorCandles;
    expect(lastOf(run(ATR_INDICATOR, { period: 14 }, candles))).toBe(0);
    expect(lastOf(run(ADX_INDICATOR, { period: 14 }, candles))).toStrictEqual({
      adx: 0,
      minusDi: 0,
      plusDi: 0,
    });
    expect(lastOf(run(OBV_INDICATOR, {}, candles))).toBe(0);
  });

  test('a steady rise has no downward movement: -DI is exactly 0 and +DI is positive', () => {
    const last = lastOf(run(ADX_INDICATOR, { period: 14 }, MONOTONE_RISE_SERIES.indicatorCandles));
    expect(last?.minusDi).toBe(0);
    expect(last?.plusDi).toBeGreaterThan(0);
    expect(last?.adx).toBeGreaterThan(50);
  });

  test('a tie between the upward and the downward move counts for neither side (Wilder)', () => {
    const base = { openTime: 0, open: 9, close: 9, volume: 1 };
    const candles: IndicatorCandle[] = [
      { ...base, high: 10, low: 8 },
      { ...base, openTime: 3_600_000, high: 11, low: 7 },
    ];
    const series = run(ADX_INDICATOR, { period: 1 }, candles);
    expect(series[1]).toStrictEqual({ adx: 0, minusDi: 0, plusDi: 0 });
  });

  test('the OBV does not change when the close is equal and starts at 0', () => {
    const candles: IndicatorCandle[] = [10, 10, 11, 11, 10].map((close, index) => ({
      openTime: index * 3_600_000,
      open: close,
      high: close,
      low: close,
      close,
      volume: 5,
    }));
    expect(run(OBV_INDICATOR, {}, candles)).toStrictEqual([0, 0, 5, 5, 0]);
  });

  test('with zero volume in the session the VWAP is the typical price; volume then weights alone', () => {
    const candle = (high: number, low: number, close: number, volume: number): IndicatorCandle => ({
      openTime: 0,
      open: close,
      high,
      low,
      close,
      volume,
    });
    const series = run(VWAP_INDICATOR, {}, [
      candle(102, 99, 99, 0),
      candle(111, 109, 110, 10),
      candle(91, 89, 90, 0),
    ]);
    expect(series).toStrictEqual([100, 110, 110]);
  });

  test('the whole zero-volume series gives a finite VWAP equal to the typical price', () => {
    const candles = ZERO_VOLUME_SERIES.indicatorCandles;
    const series = run(VWAP_INDICATOR, {}, candles);
    series.forEach((value, index) => {
      const candle = candles[index];
      expect(value).toBeCloseTo(
        ((candle?.high ?? 0) + (candle?.low ?? 0) + (candle?.close ?? 0)) / 3,
        10,
      );
    });
  });
});

describe('composite parameters', () => {
  test('ema-cross needs fast < slow', () => {
    expect(codeOf(() => EMA_CROSS_INDICATOR.create({ fastPeriod: 21, slowPeriod: 9 }))).toBe(
      INDICATOR_ERROR_CODE.INVALID_PARAMETER,
    );
    expect(
      codeOf(() => EMA_CROSS_INDICATOR.create({ fastPeriod: 9, slowPeriod: 21 })),
    ).toBeUndefined();
  });
});
