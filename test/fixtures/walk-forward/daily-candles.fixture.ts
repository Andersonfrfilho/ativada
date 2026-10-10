// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../../packages/strategy-engine/src/index.js';
import { createRandom } from './walk-forward-api.fixture.js';

export const DAY_MILLISECONDS = 86_400_000;
export const HOUR_MILLISECONDS = 3_600_000;
const CENTS = 100;
const START_PRICE_CENTS = 30_000 * CENTS;
const MINIMUM_PRICE_CENTS = 100_00;
const BASIS_POINT = 10_000;
const WICK_BASIS_POINTS = 60;

function formatCents(cents: number): string {
  return `${Math.floor(cents / CENTS)}.${String(cents % CENTS).padStart(2, '0')}000000`;
}

export type DailySeriesParams = {
  readonly count: number;
  readonly seed: number;
  readonly firstOpenTime: number;
  // Pontos-base de tendência por dia (0 = passeio aleatório sem borda).
  readonly driftBasisPoints?: number;
  readonly volatilityBasisPoints?: number;
  // Período do ciclo de reversão à média (0 = nenhum): o preço oscila ao redor de uma média móvel.
  readonly cyclePeriod?: number;
  readonly cycleBasisPoints?: number;
  // Granularidade dos candles (padrão diário).
  readonly timeframe?: '1h' | '1d';
  readonly symbol?: string;
};

// Candles diários sintéticos de semente fixa: passeio aleatório (com ou sem tendência/ciclo) em `1d`.
export function buildDailyCandles(params: DailySeriesParams): EngineCandle[] {
  const random = createRandom(params.seed);
  const drift = params.driftBasisPoints ?? 0;
  const volatility = params.volatilityBasisPoints ?? 180;
  const cyclePeriod = params.cyclePeriod ?? 0;
  const cycleBasisPoints = params.cycleBasisPoints ?? 0;
  const timeframe = params.timeframe ?? '1d';
  const step = timeframe === '1h' ? HOUR_MILLISECONDS : DAY_MILLISECONDS;
  const candles: EngineCandle[] = [];
  let closeCents = START_PRICE_CENTS;
  for (let index = 0; index < params.count; index += 1) {
    const shock = (random() - 0.5) * 2 * volatility;
    const phase = cyclePeriod === 0 ? 0 : ((index % cyclePeriod) / cyclePeriod) * 2;
    const cycle = cyclePeriod === 0 ? 0 : (phase < 1 ? 1 : -1) * cycleBasisPoints;
    const openCents = closeCents;
    const nextCents = Math.max(
      MINIMUM_PRICE_CENTS,
      Math.round(openCents * (1 + (drift + shock + cycle) / BASIS_POINT)),
    );
    const wickUp = Math.round((openCents * (random() * WICK_BASIS_POINTS)) / BASIS_POINT);
    const wickDown = Math.round((openCents * (random() * WICK_BASIS_POINTS)) / BASIS_POINT);
    const openTime = params.firstOpenTime + index * step;
    candles.push({
      symbol: params.symbol ?? 'BTCUSDT',
      timeframe,
      openTime,
      closeTime: openTime + step - 1,
      open: formatCents(openCents),
      high: formatCents(Math.max(openCents, nextCents) + wickUp),
      low: formatCents(Math.max(1, Math.min(openCents, nextCents) - wickDown)),
      close: formatCents(nextCents),
      volume: `${Math.round(800 + random() * 2_000)}.00000000`,
    });
    closeCents = nextCents;
  }
  return candles;
}
