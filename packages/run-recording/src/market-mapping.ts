// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord, SentimentObservationRecord } from '@ativada/database';
import {
  ENGINE_TIMEFRAME,
  type EngineCandle,
  type StoredSentimentObservation,
} from '@ativada/strategy-engine';

const TIMEFRAMES: readonly string[] = Object.values(ENGINE_TIMEFRAME);

export function isCandleTimeframe(value: string): value is CandleRecord['timeframe'] {
  return TIMEFRAMES.includes(value);
}

export function toEngineCandle(record: CandleRecord): EngineCandle {
  return {
    symbol: record.symbol,
    timeframe: record.timeframe,
    openTime: record.openTime,
    closeTime: record.closeTime,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
  };
}

export function toStoredSentiment(record: SentimentObservationRecord): StoredSentimentObservation {
  return {
    value: record.fearGreed,
    observedAt: record.observedAt,
    source: record.source,
    createdAt: record.createdAt.getTime(),
  };
}
