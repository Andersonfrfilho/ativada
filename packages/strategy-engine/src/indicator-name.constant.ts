// Copyright (c) 2026 Ada Technology. All rights reserved.

export const INDICATOR_NAME = {
  SMA: 'sma',
  EMA: 'ema',
  MACD: 'macd',
  DONCHIAN: 'donchian',
  RSI: 'rsi',
  BOLLINGER: 'bollinger',
  Z_SCORE: 'z-score',
  VWAP: 'vwap',
  OBV: 'obv',
  ATR: 'atr',
  ADX: 'adx',
  EMA_CROSS: 'ema-cross',
  OBV_TREND: 'obv-trend',
} as const;

export type IndicatorName = (typeof INDICATOR_NAME)[keyof typeof INDICATOR_NAME];
