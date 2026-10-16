// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_TIMEFRAME,
  type EngineCandle,
  type StoredSentimentObservation,
} from '../../../packages/strategy-engine/src/index.js';
import slice from '../risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from '../risk-analyst/market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import type { RealDataset } from '../strategy-engine/signal/classic-signals.fixture.js';
import { SENTIMENT_SOURCE } from '../strategy-engine/signal/scoreboard-configs.fixture.js';

type SliceRow = readonly [number, string, string, string, string, string, number];

const SYMBOL = 'BTCUSDT';

// O recorte REAL de 15 min do banco de dev (3.300 velas contíguas de BTCUSDT, T0.2 da spec 007) como conjunto da simulação
// ao vivo: o único conjunto real de 15 min, a vela em que o analista vive.
export const ANALYST_REAL_DATASET: RealDataset = {
  name: 'BTCUSDT 15m × 3300',
  market: {
    symbol: SYMBOL,
    timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
    sentimentSource: SENTIMENT_SOURCE,
  },
  candles: (slice as unknown as SliceRow[]).map(
    ([openTime, open, high, low, close, volume, closeTime]): EngineCandle => ({
      symbol: SYMBOL,
      timeframe: ENGINE_TIMEFRAME.FIFTEEN_MINUTES,
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
    }),
  ),
};

// O Fear & Greed real do período: cada leitura vale a partir da própria abertura (`createdAt` = `observedAt`).
export const ANALYST_REAL_SENTIMENT: readonly StoredSentimentObservation[] = (
  fearGreedRows as [number, number][]
).map(([observedAt, value]) => ({
  value,
  observedAt,
  source: SENTIMENT_SOURCE,
  createdAt: observedAt,
}));

export const ANALYST_SHADOW_REQUEST = { version: 'analyst-1', mode: 'shadow' } as const;
