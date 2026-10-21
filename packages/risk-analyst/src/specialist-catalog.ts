// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STRATEGY_FAMILY, type StrategyFamily } from '@ativada/strategy-engine';

import { SPECIALIST_KEY, type SpecialistKey } from './analyst.constant.js';

// O risco do Placar clássico: o ATR de 14 velas é a leitura de oscilação do analista.
const SPECIALIST_RISK = {
  atrPeriod: 14,
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  riskPerTrade: '0.01',
  maxExposureRate: '1',
} as const;

type SpecialistRule = Readonly<Record<string, string | number>>;

export type SpecialistConfig = {
  readonly schemaVersion: 1;
  readonly rules: readonly SpecialistRule[];
  readonly regime: { readonly kind: 'none' };
  readonly thresholds: { readonly buy: '1'; readonly sell: '-1' };
  readonly entry: { readonly orderType: 'market' };
  readonly risk: typeof SPECIALIST_RISK;
};

export type SpecialistDefinition = {
  readonly key: SpecialistKey;
  readonly family: StrategyFamily;
  readonly config: SpecialistConfig;
};

function specialistConfig(rules: readonly SpecialistRule[]): SpecialistConfig {
  return {
    schemaVersion: 1,
    rules,
    regime: { kind: 'none' },
    thresholds: { buy: '1', sell: '-1' },
    entry: { orderType: 'market' },
    risk: SPECIALIST_RISK,
  };
}

// Catálogo `analyst-1` (A2), FECHADO: uma estratégia de uma família só por especialista, limiar ±1, sem regime. O voto é
// o sinal do placar do `signalStep` de produção; nenhum indicador é reimplementado aqui.
export const SPECIALIST_CATALOG: Readonly<Record<SpecialistKey, SpecialistDefinition>> = {
  [SPECIALIST_KEY.TREND]: {
    key: SPECIALIST_KEY.TREND,
    family: STRATEGY_FAMILY.TREND,
    config: specialistConfig([
      { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 },
      { id: 'macd-12-26-9', kind: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      { id: 'donchian-20', kind: 'donchian_breakout', period: 20 },
    ]),
  },
  [SPECIALIST_KEY.REVERSION]: {
    key: SPECIALIST_KEY.REVERSION,
    family: STRATEGY_FAMILY.REVERSION,
    config: specialistConfig([
      { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 },
      { id: 'bollinger-20', kind: 'bollinger', period: 20, deviations: '2' },
    ]),
  },
  [SPECIALIST_KEY.VOLUME]: {
    key: SPECIALIST_KEY.VOLUME,
    family: STRATEGY_FAMILY.VOLUME,
    config: specialistConfig([{ id: 'obv-ema-20', kind: 'obv_trend', emaPeriod: 20 }]),
  },
  [SPECIALIST_KEY.SENTIMENT]: {
    key: SPECIALIST_KEY.SENTIMENT,
    family: STRATEGY_FAMILY.SENTIMENT,
    config: specialistConfig([
      { id: 'fear-greed-25-75', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
    ]),
  },
};
