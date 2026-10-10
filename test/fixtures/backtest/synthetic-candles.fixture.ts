// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../../packages/strategy-engine/src/index.js';

export const SYNTHETIC_SEED = 20_261_012;
export const TWO_YEARS_OF_HOURLY_CANDLES = 17_520;
export const SYNTHETIC_FIRST_OPEN_TIME = Date.UTC(2023, 0, 1);
export const SYNTHETIC_SYMBOL = 'BTCUSDT';
const HOUR_MILLISECONDS = 3_600_000;
const START_PRICE = 20_000;
const CENTS = 100;
const MINIMUM_PRICE_CENTS = 100_00;
const DRIFT_BASIS_POINTS = 1;
const VOLATILITY_BASIS_POINTS = 55;
const BASIS_POINT = 10_000;
const WICK_BASIS_POINTS = 25;
const REGIME_LENGTH = 400;
const REGIME_DRIFT_BASIS_POINTS = 6;

// PRNG inteiro de semente fixa (mulberry32): a série é a mesma em qualquer máquina e em qualquer execução.
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function formatCents(cents: number): string {
  const whole = Math.floor(cents / CENTS);
  const fraction = String(cents % CENTS).padStart(2, '0');
  return `${whole}.${fraction}000000`;
}

export type SyntheticSeriesParams = {
  readonly count: number;
  readonly seed: number;
  readonly firstOpenTime: number;
};

// Passeio aleatório com tendências que mudam a cada ~400 candles: o Placar clássico opera nos dois regimes.
export function buildSyntheticCandles(params: SyntheticSeriesParams): EngineCandle[] {
  const random = createSeededRandom(params.seed);
  const candles: EngineCandle[] = [];
  let closeCents = START_PRICE * CENTS;
  let trendSign = 1;
  for (let index = 0; index < params.count; index += 1) {
    if (index % REGIME_LENGTH === 0) trendSign = random() < 0.5 ? -1 : 1;
    const shock = (random() - 0.5) * 2 * VOLATILITY_BASIS_POINTS;
    const drift = DRIFT_BASIS_POINTS + trendSign * REGIME_DRIFT_BASIS_POINTS;
    const openCents = closeCents;
    const nextCents = Math.max(
      MINIMUM_PRICE_CENTS,
      Math.round(openCents * (1 + (drift + shock) / BASIS_POINT)),
    );
    const wickUp = Math.round((openCents * (random() * WICK_BASIS_POINTS)) / BASIS_POINT);
    const wickDown = Math.round((openCents * (random() * WICK_BASIS_POINTS)) / BASIS_POINT);
    const highCents = Math.max(openCents, nextCents) + wickUp;
    const lowCents = Math.max(1, Math.min(openCents, nextCents) - wickDown);
    const openTime = params.firstOpenTime + index * HOUR_MILLISECONDS;
    candles.push({
      symbol: SYNTHETIC_SYMBOL,
      timeframe: '1h',
      openTime,
      closeTime: openTime + HOUR_MILLISECONDS - 1,
      open: formatCents(openCents),
      high: formatCents(highCents),
      low: formatCents(lowCents),
      close: formatCents(nextCents),
      volume: `${Math.round(500 + random() * 4_500)}.${String(Math.floor(random() * 1e8)).padStart(8, '0')}`,
    });
    closeCents = nextCents;
  }
  return candles;
}

export function buildTwoYearSyntheticSeries(): EngineCandle[] {
  return buildSyntheticCandles({
    count: TWO_YEARS_OF_HOURLY_CANDLES,
    seed: SYNTHETIC_SEED,
    firstOpenTime: SYNTHETIC_FIRST_OPEN_TIME,
  });
}
