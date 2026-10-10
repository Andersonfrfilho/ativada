// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineTimeframe } from './engine.constant.js';

// Estruturalmente compatível com o `Candle` de @cryptoada/market-data, sem depender dele: o motor não
// conhece banco nem rede. Preços e volume em texto decimal exato; o tempo de identidade é `openTime`.
export type EngineCandle = {
  readonly symbol: string;
  readonly timeframe: EngineTimeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
};

// Sentimento externo (Fear & Greed): só entra se já tinha sido publicado no fechamento do candle.
export type SentimentObservation = {
  readonly value: number;
  readonly observedAt: number;
};
