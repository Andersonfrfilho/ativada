// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Timeframe } from './timeframe.constant.js';

// Preços e volume ficam como string decimal exata: float binário não cruza a borda (constituição §6).
export type Candle = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly tradeCount: number;
};
