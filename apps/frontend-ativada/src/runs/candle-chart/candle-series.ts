// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../../format/decimal.js';
import { MILLISECONDS_PER_SECOND } from './candle-chart.constant.js';
import type { SurfaceCandle, SurfaceTime, SurfaceVolumeBar } from './chart-surface.types.js';
import type { CandleShape, CandleWithVolume } from './market-candles.validation.js';

// A ÚNICA conversão de texto decimal para `number` do gráfico (RNF03): a biblioteca desenha em ponto flutuante,
// mas dinheiro e porcentagem que aparecem como texto continuam em BigInt. Os outros arquivos importam esta função.
export function toDrawingNumber(text: string): number {
  return Number(text);
}

// O gráfico desenha em segundos UTC; o fuso do usuário só entra nos rótulos (formatInZone).
export function toSurfaceTime(milliseconds: number): SurfaceTime {
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
}

export function toSurfaceCandle(candle: CandleShape): SurfaceCandle {
  return {
    time: toSurfaceTime(candle.openTime),
    open: toDrawingNumber(candle.open),
    high: toDrawingNumber(candle.high),
    low: toDrawingNumber(candle.low),
    close: toDrawingNumber(candle.close),
  };
}

export function toSurfaceCandles(candles: readonly CandleShape[]): SurfaceCandle[] {
  return candles.map(toSurfaceCandle);
}

// Alta quando fechou igual ou acima da abertura (como na corretora); a comparação é exata, em BigInt.
export function isRisingCandle(candle: Pick<CandleShape, 'open' | 'close'>): boolean {
  const open = parseScaled(candle.open);
  const close = parseScaled(candle.close);
  return open !== undefined && close !== undefined && close >= open;
}

export function toVolumeBars(candles: readonly CandleWithVolume[]): SurfaceVolumeBar[] {
  return candles.map((candle) => ({
    time: toSurfaceTime(candle.openTime),
    value: toDrawingNumber(candle.volume),
    isUp: isRisingCandle(candle),
  }));
}
