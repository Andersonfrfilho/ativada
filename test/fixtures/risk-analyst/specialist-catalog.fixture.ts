// Copyright (c) 2026 Ada Technology. All rights reserved.

// Catálogo `analyst-1` dos especialistas (ADR 0002, "Analista de risco (spec 007)", A2), escrito à mão e sem importar o
// `src`: a T1.2 confere que `SPECIALIST_CATALOG` de `packages/risk-analyst` é IGUAL a este, campo a campo. Cada
// especialista é uma estratégia de UMA família, sem regime, limiar ±1 e o risco do Placar clássico (o ATR 14 do risco é
// a leitura de oscilação do analista).
const SPECIALIST_RISK = {
  atrPeriod: 14,
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  riskPerTrade: '0.01',
  maxExposureRate: '1',
} as const;

function specialistConfig(rules: readonly Readonly<Record<string, string | number>>[]): unknown {
  return {
    schemaVersion: 1,
    rules,
    regime: { kind: 'none' },
    thresholds: { buy: '1', sell: '-1' },
    entry: { orderType: 'market' },
    risk: SPECIALIST_RISK,
  };
}

export const ORACLE_SPECIALIST_KEYS = ['trend', 'reversion', 'volume', 'sentiment'] as const;
export type OracleSpecialistKey = (typeof ORACLE_SPECIALIST_KEYS)[number];

export const ORACLE_SPECIALIST_CONFIGS: Readonly<Record<OracleSpecialistKey, unknown>> = {
  trend: specialistConfig([
    { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 },
    { id: 'macd-12-26-9', kind: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    { id: 'donchian-20', kind: 'donchian_breakout', period: 20 },
  ]),
  reversion: specialistConfig([
    { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 },
    { id: 'bollinger-20', kind: 'bollinger', period: 20, deviations: '2' },
  ]),
  volume: specialistConfig([{ id: 'obv-ema-20', kind: 'obv_trend', emaPeriod: 20 }]),
  sentiment: specialistConfig([
    { id: 'fear-greed-25-75', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
  ]),
};
