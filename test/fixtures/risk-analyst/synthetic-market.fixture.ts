// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../../packages/strategy-engine/src/index.js';
import { createRandom } from './decision-scenario.fixture.js';

// Mercado sintético e determinístico de 15 min para o dourado `analyst-1` (T1.4 da spec 007): o preço volta à média (um
// processo de reversão com ruído), de modo que a Reversão tem o que provar; o volume tem picos e vales e as velas respeitam
// máxima ≥ abertura/fechamento ≥ mínima. Tudo em texto decimal com 4 casas.

const FIFTEEN_MINUTES = 900_000;
const MEAN_PRICE = 100;
const REVERSION_STRENGTH = 0.35;
const NOISE = 0.012;
const WICK = 0.0012;
const BASE_VOLUME = 1000;

export const SYNTHETIC_SYMBOL = 'ETHUSDT';

export type SyntheticMarketParams = {
  readonly length: number;
  readonly seed: number;
  readonly firstOpenTime: number;
};

function normalNoise(random: () => number): number {
  // Soma de 6 uniformes: média 3, variância 0,5; centra e escala para ~N(0, 1).
  let total = 0;
  for (let step = 0; step < 6; step += 1) total += random();
  return (total - 3) / Math.sqrt(0.5);
}

function decimal(value: number): string {
  return value.toFixed(4);
}

export function buildSyntheticCandles(params: SyntheticMarketParams): readonly EngineCandle[] {
  const random = createRandom(params.seed);
  let deviation = 0;
  let previousClose = MEAN_PRICE;
  return Array.from({ length: params.length }, (_unused, index) => {
    deviation = deviation * (1 - REVERSION_STRENGTH) + NOISE * normalNoise(random);
    const open = previousClose;
    const close = MEAN_PRICE * Math.exp(deviation);
    const high = Math.max(open, close) * (1 + WICK * random());
    const low = Math.min(open, close) * (1 - WICK * random());
    const spike = random() < 0.04 ? 4 + 4 * random() : 1;
    const volume = BASE_VOLUME * (0.6 + random()) * spike;
    previousClose = close;
    const openTime = params.firstOpenTime + index * FIFTEEN_MINUTES;
    return {
      symbol: SYNTHETIC_SYMBOL,
      timeframe: '15m',
      openTime,
      closeTime: openTime + FIFTEEN_MINUTES - 1,
      open: decimal(open),
      high: decimal(high),
      low: decimal(low),
      close: decimal(close),
      volume: decimal(volume),
    };
  });
}
