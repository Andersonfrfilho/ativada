// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createCandleRepository,
  createSentimentRepository,
  openDatabase,
  type DatabaseHandle,
} from '../../packages/database/src/index.js';
import { readDatabaseUrl } from '../../packages/database/src/read-database-url.js';
import type { EngineCandle, EngineMarket } from '../../packages/strategy-engine/src/index.js';
import type { FearGreedDay } from '../../test/fixtures/risk-analyst/real-series.fixture.js';

// Leitura SOMENTE de velas e Fear & Greed do banco de DEV (T0.2 da spec 007): só `SELECT` pelos repositórios de leitura.

const EXCHANGE = 'binance';
const SENTIMENT_SOURCE = 'alternative.me';
const DAY = 86_400_000;

export type Timeframe = '15m' | '1h';

export type PairSeries = {
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
};

export function openSource(): DatabaseHandle {
  return openDatabase(readDatabaseUrl());
}

export async function readPair(
  handle: DatabaseHandle,
  params: { readonly symbol: string; readonly timeframe: Timeframe },
): Promise<PairSeries> {
  const rows = await createCandleRepository(handle).findCandles({
    exchange: EXCHANGE,
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: 0,
    to: Date.now(),
  });
  return {
    market: {
      symbol: params.symbol,
      timeframe: params.timeframe,
      sentimentSource: SENTIMENT_SOURCE,
    },
    candles: rows.map((row) => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      openTime: row.openTime,
      closeTime: row.closeTime,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })),
  };
}

export async function readFearGreed(handle: DatabaseHandle): Promise<readonly FearGreedDay[]> {
  const rows = await createSentimentRepository(handle).findFearGreed({
    from: '2000-01-01',
    to: '2100-01-01',
  });
  return rows.map((row) => ({
    observedAt: Date.parse(`${row.date}T00:00:00Z`),
    value: row.fearGreed,
  }));
}

export { closeDatabase, DAY };
