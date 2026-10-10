// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createStrategyVersion } from './parse-strategy-config.js';
import type { StrategyVersion } from './strategy-config.types.js';

// A estratégia de exemplo de todo usuário novo (plano §4, RF03): fonte ÚNICA, validada pelo esquema do motor.
export type ExampleStrategy = {
  readonly name: string;
  readonly description: string;
  readonly version: StrategyVersion;
};

const CLASSIC_SCOREBOARD_CONFIG = {
  schemaVersion: 1,
  rules: [
    { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 },
    { id: 'macd-12-26-9', kind: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 },
    { id: 'obv-ema-20', kind: 'obv_trend', emaPeriod: 20 },
  ],
  regime: {
    kind: 'adx',
    period: 14,
    trendThreshold: 25,
    weights: {
      trending: { trend: '1.5', reversion: '0.5', volume: '1', sentiment: '1' },
      ranging: { trend: '0.5', reversion: '1.5', volume: '1', sentiment: '1' },
    },
  },
  thresholds: { buy: '2', sell: '-2' },
  entry: { orderType: 'market' },
  risk: {
    atrPeriod: 14,
    stopAtrMultiple: '2',
    targetAtrMultiple: '3',
    riskPerTrade: '0.01',
    maxExposureRate: '1',
  },
} as const;

export const CLASSIC_SCOREBOARD_STRATEGY: ExampleStrategy = {
  name: 'Placar clássico',
  description:
    'Quatro votos (EMA 9 × 21, MACD, RSI e OBV) ponderados pelo regime do ADX; compra com pontuação a partir de +2, vende a partir de −2, stop de 2×ATR e alvo de 3×ATR.',
  version: createStrategyVersion(CLASSIC_SCOREBOARD_CONFIG),
};
