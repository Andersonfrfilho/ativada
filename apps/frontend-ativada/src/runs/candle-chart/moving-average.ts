// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceAverage, SurfaceCandle } from './chart-surface.types.js';

export const AVERAGE_PERIODS = [20, 50] as const;

// Média simples dos fechamentos das últimas `period` velas, a partir da vela em que a janela se completa. É desenho do
// telão (os números de desenho das velas), nunca dinheiro: nenhum valor daqui vai à API ou a um texto de preço.
export function computeMovingAverage(
  candles: readonly SurfaceCandle[],
  period: SurfaceAverage['period'],
): SurfaceAverage {
  const points: { time: number; value: number }[] = [];
  let sum = 0;
  candles.forEach((candle, index) => {
    sum += candle.close;
    const leaving = candles[index - period];
    if (leaving !== undefined) sum -= leaving.close;
    if (index >= period - 1) points.push({ time: candle.time, value: sum / period });
  });
  return { period, points };
}

export function computeAverages(candles: readonly SurfaceCandle[]): readonly SurfaceAverage[] {
  return AVERAGE_PERIODS.map((period) => computeMovingAverage(candles, period));
}
