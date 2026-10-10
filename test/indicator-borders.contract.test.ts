// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  BOLLINGER_INDICATOR,
  computeIndicatorSeries,
  DONCHIAN_INDICATOR,
  EMA_INDICATOR,
  INDICATOR_ERROR_CODE,
  IndicatorError,
  MACD_INDICATOR,
  RSI_INDICATOR,
  SMA_INDICATOR,
  Z_SCORE_INDICATOR,
  type Indicator,
  type IndicatorCandle,
  type IndicatorDefinition,
  type IndicatorErrorCode,
  type IndicatorValue,
  type JsonValue,
} from '../packages/strategy-engine/src/index.js';
import {
  BOLLINGER_SPEC,
  DONCHIAN_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  RSI_SPEC,
  SMA_SPEC,
  ZSCORE_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';
import {
  MONOTONE_FALL_SERIES,
  MONOTONE_RISE_SERIES,
  PLATEAU_SERIES,
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
