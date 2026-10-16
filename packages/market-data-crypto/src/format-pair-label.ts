// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MarketCandleTimeframe } from './timeframe.constant.js';

export type PairKey = { readonly symbol: string; readonly timeframe: MarketCandleTimeframe };

export function formatPairLabel(pair: PairKey): string {
  return `${pair.symbol}/${pair.timeframe}`;
}
