// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Timeframe } from './timeframe.constant.js';

export type PairKey = { readonly symbol: string; readonly timeframe: Timeframe };

export function formatPairLabel(pair: PairKey): string {
  return `${pair.symbol}/${pair.timeframe}`;
}
