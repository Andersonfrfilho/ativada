// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MarketCandleTimeframe, Timeframe } from './timeframe.constant.js';

// Preços e volume ficam como string decimal exata: float binário não cruza a borda (constituição §6).
// O padrão é o timeframe de execução (compatível com o motor); `MarketCandle` inclui as velas de exibição.
export type Candle<TTimeframe extends MarketCandleTimeframe = Timeframe> = {
  readonly symbol: string;
  readonly timeframe: TTimeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly tradeCount: number;
};

export type MarketCandle = Candle<MarketCandleTimeframe>;
