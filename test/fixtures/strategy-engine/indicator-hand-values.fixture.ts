// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorCandle } from '../../../packages/strategy-engine/src/index.js';
import type { ReferenceSeries } from './oracle/oracle-comparison.fixture.js';

// Seis candles de 1h, contas feitas no papel. Os dois primeiros caem no dia UTC 1; do terceiro em diante
// é o dia 2 (a VWAP reinicia). Fechamentos: 10, 11, 12, 14, 13, 12.
const FIRST_OPEN_TIME = Date.UTC(2025, 0, 1, 22);
const HOUR_MILLISECONDS = 3_600_000;

type HandRow = readonly [open: number, high: number, low: number, close: number, volume: number];

const HAND_ROWS: readonly HandRow[] = [
  [10, 11, 9, 10, 100],
  [10, 12, 9, 11, 200],
  [11, 13, 11, 12, 150],
  [12, 15, 12, 14, 300],
  [14, 14, 12, 13, 250],
  [13, 13, 11, 12, 100],
];

export const HAND_CANDLES: readonly IndicatorCandle[] = HAND_ROWS.map(
  ([open, high, low, close, volume], index) => ({
    openTime: FIRST_OPEN_TIME + index * HOUR_MILLISECONDS,
    open,
    high,
    low,
    close,
    volume,
  }),
);

export const HAND_PERIOD = 3;
const NONE = undefined;
const HAND_DEVIATION_MULTIPLE = 2;

function singleSeries(values: readonly (number | undefined)[]): ReferenceSeries {
  return values.map((value) => (value === undefined ? undefined : { value }));
}

// RSI(3): ganhos 1,1,2,0,0 e perdas 0,0,0,1,1. Semente (4/3, 0) ⇒ 100; depois Wilder:
// (8/9, 1/3) ⇒ 100 − 100/(1 + 8/3) = 800/11; (16/27, 5/9) ⇒ 100 − 100/(1 + 16/15) = 1600/31.
// ATR(3): TR = 2, 3, 2, 3, 2, 2; semente 7/3; depois 23/9, 64/27, 182/81.
// Bollinger(3, 2) e z-score no índice 2: janela 10,11,12 ⇒ média 11, desvio √(2/3).
const SQRT_TWO_THIRDS = Math.sqrt(2 / 3);
// Janela 11,12,14 ⇒ média 37/3, variância 14/9.
const SQRT_FOURTEEN_NINTHS = Math.sqrt(14) / 3;

export const HAND_EXPECTED: Readonly<Record<string, ReferenceSeries>> = {
  sma: singleSeries([NONE, NONE, 11, 37 / 3, 13, 13]),
  ema: singleSeries([NONE, NONE, 11, 12.5, 12.75, 12.375]),
  rsi: singleSeries([NONE, NONE, NONE, 100, 800 / 11, 1600 / 31]),
  atr: singleSeries([NONE, NONE, 7 / 3, 23 / 9, 64 / 27, 182 / 81]),
  obv: singleSeries([0, 200, 350, 650, 400, 300]),
  vwap: singleSeries([10, 9400 / 900, 12, 5900 / 450, 9150 / 700, 10350 / 800]),
  zScore: singleSeries([NONE, NONE, 1 / SQRT_TWO_THIRDS, (14 - 37 / 3) / SQRT_FOURTEEN_NINTHS]),
  donchian: [
    NONE,
    NONE,
    { upper: 13, lower: 9 },
    { upper: 15, lower: 9 },
    { upper: 15, lower: 11 },
    { upper: 15, lower: 11 },
  ],
  bollinger: [
    NONE,
    NONE,
    {
      middle: 11,
      upper: 11 + HAND_DEVIATION_MULTIPLE * SQRT_TWO_THIRDS,
      lower: 11 - HAND_DEVIATION_MULTIPLE * SQRT_TWO_THIRDS,
      width: (2 * HAND_DEVIATION_MULTIPLE * SQRT_TWO_THIRDS) / 11,
    },
    {
      middle: 37 / 3,
      upper: 37 / 3 + HAND_DEVIATION_MULTIPLE * SQRT_FOURTEEN_NINTHS,
      lower: 37 / 3 - HAND_DEVIATION_MULTIPLE * SQRT_FOURTEEN_NINTHS,
      width: (2 * HAND_DEVIATION_MULTIPLE * SQRT_FOURTEEN_NINTHS) / (37 / 3),
    },
  ],
};
