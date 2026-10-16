// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled, toPlainText } from '../../format/decimal.js';
import type { MarketCandle } from './market-candles.validation.js';

export type ComposedWindow = { readonly openTime: number; readonly closeTime: number };

type ScaledCandle = {
  readonly open: bigint;
  readonly high: bigint;
  readonly low: bigint;
  readonly close: bigint;
  readonly volume: bigint;
  readonly tradeCount: number;
  readonly hasTrades: boolean;
};

function toScaled(candle: MarketCandle): ScaledCandle | undefined {
  const open = parseScaled(candle.open);
  const high = parseScaled(candle.high);
  const low = parseScaled(candle.low);
  const close = parseScaled(candle.close);
  const volume = parseScaled(candle.volume);
  if (
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined ||
    volume === undefined
  ) {
    return undefined;
  }
  return {
    open,
    high,
    low,
    close,
    volume,
    tradeCount: candle.tradeCount,
    hasTrades: candle.tradeCount > 0,
  };
}

function extremes(
  traded: readonly ScaledCandle[],
  fallback: bigint,
): { high: bigint; low: bigint } {
  let high = traded[0]?.high ?? fallback;
  let low = traded[0]?.low ?? fallback;
  for (const candle of traded) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  return { high, low };
}

// Agrupa velas menores numa vela maior (spec 017, ADR 0002 V9), em BigInt de escala 8: abertura da primeira vela COM negócio,
// máxima e mínima só das velas com negócio, fechamento da última vela, volume e negócios somados. Uma vela sem negócio carrega
// o fechamento anterior e não define abertura, máxima nem mínima. `undefined` sem velas ou com valor ilegível.
export function composeCandles(
  candles: readonly MarketCandle[],
  window: ComposedWindow,
): MarketCandle | undefined {
  const ordered = [...candles].sort((left, right) => left.openTime - right.openTime);
  const scaled = ordered.map(toScaled);
  const parts = scaled.flatMap((part) => (part === undefined ? [] : [part]));
  const last = parts.at(-1);
  if (last === undefined || parts.length !== ordered.length) return undefined;
  const traded = parts.filter((part) => part.hasTrades);
  const open = traded[0]?.open ?? last.close;
  const { high, low } = extremes(traded, last.close);
  const volume = parts.reduce((sum, part) => sum + part.volume, 0n);
  const tradeCount = parts.reduce((sum, part) => sum + part.tradeCount, 0);
  return {
    openTime: window.openTime,
    closeTime: window.closeTime,
    open: toPlainText(open),
    high: toPlainText(high),
    low: toPlainText(low),
    close: toPlainText(last.close),
    volume: toPlainText(volume),
    tradeCount,
  };
}

// As velas menores que cabem na vela maior `[openTime, closeTime]`, em ordem de tempo.
export function pickWindowCandles(
  candles: readonly MarketCandle[],
  window: ComposedWindow,
): MarketCandle[] {
  return candles.filter(
    (candle) => candle.openTime >= window.openTime && candle.openTime <= window.closeTime,
  );
}
