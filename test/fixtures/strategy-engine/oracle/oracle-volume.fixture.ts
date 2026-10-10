// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  type OracleCandle,
  type OracleNumber,
  type OracleSeries,
  single,
  sumOf,
  ZERO,
} from './oracle-decimal.fixture.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const THREE = 3;

function typicalPriceOf(candle: OracleCandle): OracleNumber {
  return candle.high.plus(candle.low).plus(candle.close).dividedBy(THREE);
}

function utcDayOf(candle: OracleCandle): number {
  return Math.floor(candle.openTime / MILLISECONDS_PER_DAY);
}

// Sessão = dia UTC de `openTime`; volume zero na sessão ⇒ preço típico do candle corrente.
export function computeVwapOracle(candles: readonly OracleCandle[]): OracleSeries {
  return candles.map((candle, index) => {
    const session = candles
      .slice(0, index + 1)
      .filter((entry) => utcDayOf(entry) === utcDayOf(candle));
    const volume = sumOf(session.map((entry) => entry.volume));
    if (volume.isZero()) return single(typicalPriceOf(candle));
    const traded = sumOf(session.map((entry) => typicalPriceOf(entry).times(entry.volume)));
    return single(traded.dividedBy(volume));
  });
}

// O 1º candle vale 0 (sem anterior); depois soma ±volume conforme o fechamento sobe ou cai.
export function computeObvOracle(candles: readonly OracleCandle[]): OracleSeries {
  return candles.map((_candle, index) => {
    const signedVolumes = candles.slice(1, index + 1).map((entry, offset) => {
      const previous = candles[offset];
      if (previous === undefined || entry.close.equals(previous.close)) return ZERO;
      return entry.close.greaterThan(previous.close) ? entry.volume : entry.volume.negated();
    });
    return single(sumOf(signedVolumes));
  });
}

// Piso do erro relativo do OBV (cruza o zero): volume total negociado até o candle.
export function cumulativeVolumeAt(candles: readonly OracleCandle[], index: number): OracleNumber {
  return sumOf(candles.slice(0, index + 1).map((entry) => entry.volume));
}
