// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  IndicatorCandle,
  IndicatorHorizon,
} from '../../../../packages/strategy-engine/src/index.js';
import type { OutputFloor, ReferenceSeries } from './oracle-comparison.fixture.js';
import { macdFloor, obvFloor, zScoreFloor } from './oracle-floors.fixture.js';
import type { OracleCandle, OracleSeries } from './oracle-decimal.fixture.js';
import { computeAdxOracle, computeAtrOracle, computeRsiOracle } from './oracle-momentum.fixture.js';
import { computeBollingerOracle, computeZScoreOracle } from './oracle-statistics.fixture.js';
import {
  computeDonchianOracle,
  computeEmaOracle,
  computeMacdOracle,
  computeSmaOracle,
} from './oracle-trend.fixture.js';
import { computeObvOracle, computeVwapOracle } from './oracle-volume.fixture.js';
import {
  referenceAdx,
  referenceAtr,
  referenceBollinger,
  referenceDonchian,
  referenceEma,
  referenceMacd,
  referenceObv,
  referenceRsi,
  referenceSma,
  referenceVwap,
  referenceZScore,
} from './trading-signals-oracle.fixture.js';

// Um indicador do ADR 0002 visto pelos oráculos: parâmetros, horizonte declarado (escrito à mão a partir
// das fórmulas do ADR, não calculado pelo código), oráculo de alta precisão e referência alinhada.
export type OracleSpec<TParams> = {
  readonly name: string;
  readonly params: TParams;
  readonly horizon: IndicatorHorizon;
  readonly computeOracle: (candles: readonly OracleCandle[]) => OracleSeries;
  readonly floorOf?: (candles: readonly OracleCandle[]) => OutputFloor;
  readonly computeReference: (candles: readonly IndicatorCandle[]) => ReferenceSeries;
  // Primeiro índice em que a referência alinhada vale (OBV começa a acumular no 2º candle).
  readonly referenceFromIndex?: number;
};

const PERIOD = 20;
const WILDER_PERIOD = 14;
const BOLLINGER_DEVIATIONS = 2.3;
const BOLLINGER_DEVIATIONS_TEXT = '2.3';

export const SMA_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'sma',
  params: { period: PERIOD },
  horizon: { warmupCandles: 20, convergenceCandles: 20 },
  computeOracle: (candles) => computeSmaOracle(candles, { period: PERIOD }),
  computeReference: (candles) => referenceSma({ candles, period: PERIOD }),
};

export const EMA_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'ema',
  params: { period: 21 },
  horizon: { warmupCandles: 21, convergenceCandles: 76 },
  computeOracle: (candles) => computeEmaOracle(candles, { period: 21 }),
  computeReference: (candles) => referenceEma({ candles, period: 21 }),
};

const MACD_PARAMS = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } as const;

export const MACD_SPEC: OracleSpec<typeof MACD_PARAMS> = {
  name: 'macd',
  params: MACD_PARAMS,
  horizon: { warmupCandles: 34, convergenceCandles: 129 },
  computeOracle: (candles) => computeMacdOracle(candles, MACD_PARAMS),
  floorOf: macdFloor,
  computeReference: (candles) => referenceMacd({ candles, ...MACD_PARAMS }),
};

export const DONCHIAN_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'donchian',
  params: { period: PERIOD },
  horizon: { warmupCandles: 20, convergenceCandles: 20 },
  computeOracle: (candles) => computeDonchianOracle(candles, { period: PERIOD }),
  computeReference: (candles) => referenceDonchian({ candles, period: PERIOD }),
};

export const RSI_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'rsi',
  params: { period: WILDER_PERIOD },
  horizon: { warmupCandles: 15, convergenceCandles: 97 },
  computeOracle: (candles) => computeRsiOracle(candles, { period: WILDER_PERIOD }),
  computeReference: (candles) => referenceRsi({ candles, period: WILDER_PERIOD }),
};

const BOLLINGER_PARAMS = { period: PERIOD, deviations: BOLLINGER_DEVIATIONS } as const;

export const BOLLINGER_SPEC: OracleSpec<typeof BOLLINGER_PARAMS> = {
  name: 'bollinger',
  params: BOLLINGER_PARAMS,
  horizon: { warmupCandles: 20, convergenceCandles: 20 },
  computeOracle: (candles) =>
    computeBollingerOracle(candles, { period: PERIOD, deviations: BOLLINGER_DEVIATIONS_TEXT }),
  computeReference: (candles) =>
    referenceBollinger({ candles, period: PERIOD, deviations: BOLLINGER_DEVIATIONS }),
};

export const ZSCORE_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'z-score',
  params: { period: PERIOD },
  horizon: { warmupCandles: 20, convergenceCandles: 20 },
  computeOracle: (candles) => computeZScoreOracle(candles, { period: PERIOD }),
  floorOf: zScoreFloor,
  computeReference: (candles) => referenceZScore({ candles, period: PERIOD }),
};

export const VWAP_SPEC: OracleSpec<Record<string, never>> = {
  name: 'vwap',
  params: {},
  horizon: { warmupCandles: 1, convergenceCandles: 1 },
  computeOracle: computeVwapOracle,
  computeReference: (candles) => referenceVwap({ candles }),
};

export const OBV_SPEC: OracleSpec<Record<string, never>> = {
  name: 'obv',
  params: {},
  horizon: { warmupCandles: 1, convergenceCandles: 1 },
  computeOracle: computeObvOracle,
  floorOf: obvFloor,
  computeReference: (candles) => referenceObv({ candles }),
  referenceFromIndex: 1,
};

export const ATR_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'atr',
  params: { period: WILDER_PERIOD },
  horizon: { warmupCandles: 14, convergenceCandles: 97 },
  computeOracle: (candles) => computeAtrOracle(candles, { period: WILDER_PERIOD }),
  computeReference: (candles) => referenceAtr({ candles, period: WILDER_PERIOD }),
};

export const ADX_SPEC: OracleSpec<{ readonly period: number }> = {
  name: 'adx',
  params: { period: WILDER_PERIOD },
  horizon: { warmupCandles: 27, convergenceCandles: 194 },
  computeOracle: (candles) => computeAdxOracle(candles, { period: WILDER_PERIOD }),
  computeReference: (candles) => referenceAdx({ candles, period: WILDER_PERIOD }),
};

export const TREND_AND_STATISTIC_SPECS = [
  SMA_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  DONCHIAN_SPEC,
  RSI_SPEC,
  BOLLINGER_SPEC,
  ZSCORE_SPEC,
] as const;
export const VOLUME_AND_VOLATILITY_SPECS = [VWAP_SPEC, OBV_SPEC, ATR_SPEC, ADX_SPEC] as const;
