// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunSetup,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type RunSetup,
} from '../../../packages/strategy-engine/src/index.js';

export const TEAM_SYMBOL = 'LINKUSDT';
export const QUARTER_HOUR =
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS[ENGINE_TIMEFRAME.FIFTEEN_MINUTES];
// Uma hora cheia, para as velas caírem na grade do ritmo de 60 min.
export const FIRST_TEAM_OPEN_TIME = Date.UTC(2026, 9, 1);

const BASE_PRICE = 100;
const WAVE_AMPLITUDE = 6;
const WAVE_PERIOD_CANDLES = 11;
const DRIFT_PER_CANDLE = 0.03;
const WICK = 0.8;
const BIG_VOLUME = '100000';

function priceAt(index: number): number {
  return (
    BASE_PRICE + WAVE_AMPLITUDE * Math.sin(index / WAVE_PERIOD_CANDLES) + index * DRIFT_PER_CANDLE
  );
}

export function teamCandleOpenTime(index: number): number {
  return FIRST_TEAM_OPEN_TIME + index * QUARTER_HOUR;
}

// Série sintética e determinística de 15 min: onda mais deriva, abertura = fechamento anterior, pavios fixos.
export function buildTeamCandles(count: number): EngineCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = priceAt(index - 1);
    const close = priceAt(index);
    const openTime = teamCandleOpenTime(index);
    return {
      symbol: TEAM_SYMBOL,
      timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
      openTime,
      closeTime: openTime + QUARTER_HOUR - 1,
      open: open.toFixed(2),
      high: (Math.max(open, close) + WICK).toFixed(2),
      low: (Math.min(open, close) - WICK).toFixed(2),
      close: close.toFixed(2),
      volume: BIG_VOLUME,
    };
  });
}

export function buildTeamRunSetup(): RunSetup {
  return createRunSetup({
    schemaVersion: 1,
    symbol: TEAM_SYMBOL,
    timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
    sentimentSource: 'alternative.me',
    initialBalance: '10000',
    feeRate: '0.001',
    slippageRate: '0.0005',
    tickSize: '0.01',
    quantityStep: '0.01',
    minNotional: '5',
    maxVolumeShare: '0.01',
  });
}
