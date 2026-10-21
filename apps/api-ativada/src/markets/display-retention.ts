// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  type DisplayRetentionDays,
  isDisplayTimeframe,
  MARKET_CANDLE_DURATION_MILLISECONDS,
  type MarketCandleTimeframe,
} from '@ativada/market-data-crypto';

const MILLISECONDS_PER_DAY = 86_400_000;

export type DisplayRetention = {
  readonly days: DisplayRetentionDays;
  readonly now: () => number;
};

export type CandleResponseMeta = { readonly retentionStart: number };

// Primeira abertura (na grade da vela) que a retenção ainda guarda; só existe para vela de exibição.
export function readRetentionMeta(
  timeframe: MarketCandleTimeframe,
  retention: DisplayRetention | undefined,
): CandleResponseMeta | undefined {
  if (retention === undefined || !isDisplayTimeframe(timeframe)) return undefined;
  const duration = MARKET_CANDLE_DURATION_MILLISECONDS[timeframe];
  const start = retention.now() - retention.days[timeframe] * MILLISECONDS_PER_DAY;
  return { retentionStart: Math.ceil(start / duration) * duration };
}
