// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorCandle } from '../../../../packages/strategy-engine/src/index.js';
import { tradingSignals } from '../../../../packages/strategy-engine/test-support/oracle-dependencies.js';
import { SINGLE_OUTPUT } from './oracle-decimal.fixture.js';
import type { ReferenceSeries } from './oracle-comparison.fixture.js';

// Segunda referência, independente da implementação própria e do oráculo de alta precisão:
// `trading-signals` 8.3.0. Aqui as convenções são ALINHADAS às do ADR 0002 (semente SMA, etc.).
const {
  ADX,
  ATR,
  BollingerBands,
  BollingerBandsWidth,
  DonchianChannels,
  EMA,
  MACD,
  OBV,
  RSI,
  SMA,
  VWAP,
} = tradingSignals;

type PeriodArgs = { readonly candles: readonly IndicatorCandle[]; readonly period: number };

const MILLISECONDS_PER_DAY = 86_400_000;

function single(
  value: number | null | undefined | void,
): Readonly<Record<string, number>> | undefined {
  return typeof value === 'number' ? { [SINGLE_OUTPUT]: value } : undefined;
}

export function referenceSma(params: PeriodArgs): ReferenceSeries {
  const sma = new SMA(params.period);
  return params.candles.map((candle) => single(sma.add(candle.close)));
}

// EMA com a convenção do ADR: a semente é a SMA das `period` primeiras; a recursão é da biblioteca.
function alignedEma(params: {
  readonly values: readonly (number | undefined)[];
  readonly period: number;
}): (number | undefined)[] {
  const seed = new SMA(params.period);
  const ema = new EMA(params.period);
  let isSeeded = false;
  return params.values.map((value) => {
    if (value === undefined) return undefined;
    if (isSeeded) return ema.add(value) ?? undefined;
    const average = seed.add(value);
    if (average === null) return undefined;
    isSeeded = true;
    return ema.add(average) ?? undefined;
  });
}

export function referenceEma(params: PeriodArgs): ReferenceSeries {
  const values = alignedEma({
    values: params.candles.map((candle) => candle.close),
    period: params.period,
  });
  return values.map(single);
}

// EMA nativa da biblioteca (semente = primeiro valor), válida a partir do `period`-ésimo candle.
export function nativeEma(params: PeriodArgs): ReferenceSeries {
  const ema = new EMA(params.period);
  return params.candles.map((candle, index) => {
    const value = ema.add(candle.close);
    return index < params.period - 1 ? undefined : single(value);
  });
}

type MacdArgs = {
  readonly candles: readonly IndicatorCandle[];
  readonly fastPeriod: number;
  readonly slowPeriod: number;
  readonly signalPeriod: number;
};

export function referenceMacd(params: MacdArgs): ReferenceSeries {
  const closes = params.candles.map((candle) => candle.close);
  const fast = alignedEma({ values: closes, period: params.fastPeriod });
  const slow = alignedEma({ values: closes, period: params.slowPeriod });
  const macdLine = closes.map((_close, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue === undefined || slowValue === undefined ? undefined : fastValue - slowValue;
  });
  const signal = alignedEma({ values: macdLine, period: params.signalPeriod });
  return closes.map((_close, index) => {
    const macd = macdLine[index];
    const signalValue = signal[index];
    if (macd === undefined || signalValue === undefined) return undefined;
    return { macd, signal: signalValue, histogram: macd - signalValue };
  });
}

// MACD nativo (EMAs com semente no primeiro valor): equivale ao nosso só depois da convergência.
export function nativeMacd(params: MacdArgs): ReferenceSeries {
  const macd = new MACD(
    new EMA(params.fastPeriod),
    new EMA(params.slowPeriod),
    new EMA(params.signalPeriod),
  );
  return params.candles.map((candle) => {
    const result = macd.add(candle.close);
    return result === null
      ? undefined
      : { macd: result.macd, signal: result.signal, histogram: result.histogram };
  });
}

export function referenceDonchian(params: PeriodArgs): ReferenceSeries {
  const channels = new DonchianChannels(params.period);
  return params.candles.map((candle) => {
    const result = channels.add({ high: candle.high, low: candle.low });
    return result === null ? undefined : { upper: result.upper, lower: result.lower };
  });
}

export function referenceRsi(params: PeriodArgs): ReferenceSeries {
  const rsi = new RSI(params.period);
  return params.candles.map((candle) => single(rsi.add(candle.close)));
}

export function referenceBollinger(
  params: PeriodArgs & { readonly deviations: number },
): ReferenceSeries {
  const bands = new BollingerBands(params.period, params.deviations);
  const width = new BollingerBandsWidth(new BollingerBands(params.period, params.deviations));
  return params.candles.map((candle) => {
    const result = bands.add(candle.close);
    const widthValue = width.add(candle.close);
    if (result === null || widthValue === null) return undefined;
    return { lower: result.lower, middle: result.middle, upper: result.upper, width: widthValue };
  });
}

export function referenceAtr(params: PeriodArgs): ReferenceSeries {
  const atr = new ATR(params.period);
  return params.candles.map((candle) =>
    single(atr.add({ high: candle.high, low: candle.low, close: candle.close })),
  );
}

// A biblioteca expõe +DI/−DI como razão (sem ×100): a escala é a única diferença com a convenção.
export function referenceAdx(params: PeriodArgs): ReferenceSeries {
  const adx = new ADX(params.period);
  const percent = 100;
  return params.candles.map((candle) => {
    const result = adx.add({ high: candle.high, low: candle.low, close: candle.close });
    if (result === null || typeof adx.pdi !== 'number' || typeof adx.mdi !== 'number')
      return undefined;
    return { adx: result, plusDi: adx.pdi * percent, minusDi: adx.mdi * percent };
  });
}

// A biblioteca não reinicia a sessão: uma instância nova por dia UTC. Candle sem volume ela ignora,
// então só as séries reais (sem volume zero) são comparadas.
export function referenceVwap(params: {
  readonly candles: readonly IndicatorCandle[];
}): ReferenceSeries {
  let session = new VWAP();
  let currentDay = -1;
  return params.candles.map((candle) => {
    const day = Math.floor(candle.openTime / MILLISECONDS_PER_DAY);
    if (day !== currentDay) {
      session = new VWAP();
      currentDay = day;
    }
    return single(
      session.add({
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }),
    );
  });
}

// `OBV(2)` começa no 2º candle, tendo o 1º como referência: igual ao nosso a partir do índice 1.
export function referenceObv(params: {
  readonly candles: readonly IndicatorCandle[];
}): ReferenceSeries {
  const obv = new OBV(2);
  return params.candles.map((candle) => single(obv.add(candle)));
}

// z-score: a biblioteca não tem; usa a média e o desvio populacional dela (getStandardDeviation).
export function referenceZScore(params: PeriodArgs): ReferenceSeries {
  const window: number[] = [];
  return params.candles.map((candle) => {
    window.push(candle.close);
    if (window.length > params.period) window.shift();
    if (window.length < params.period) return undefined;
    const mean = tradingSignals.getAverage(window);
    const deviation = tradingSignals.getStandardDeviation(window, mean);
    return single(deviation === 0 ? 0 : (candle.close - mean) / deviation);
  });
}
