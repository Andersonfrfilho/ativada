// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  parseStrategyConfig,
  RULE_KIND,
  type RuleReading,
  type ScoreboardReadings,
  type StrategyConfig,
  type StrategyConfigInput,
} from '../../../../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from '../engine-scenarios.fixture.js';

export const SENTIMENT_SOURCE = 'alternative.me';
export const CLOSE_TIME = 1_000_000_000_000;
export const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1_000;

const EMA_RULE = { id: 'ema-9-21', kind: RULE_KIND.EMA_CROSS, fastPeriod: 9, slowPeriod: 21 };
const MACD_RULE = {
  id: 'macd-12-26-9',
  kind: RULE_KIND.MACD,
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
};
const DONCHIAN_RULE = { id: 'donchian-20', kind: RULE_KIND.DONCHIAN_BREAKOUT, period: 20 };
const RSI_RULE = { id: 'rsi-14', kind: RULE_KIND.RSI, period: 14, oversold: 30, overbought: 70 };
const BOLLINGER_RULE = {
  id: 'bollinger-20',
  kind: RULE_KIND.BOLLINGER,
  period: 20,
  deviations: '2',
};
const OBV_RULE = { id: 'obv-ema-20', kind: RULE_KIND.OBV_TREND, emaPeriod: 20 };
const FEAR_GREED_RULE = {
  id: 'fear-greed',
  kind: RULE_KIND.FEAR_GREED,
  fearAtOrBelow: 25,
  greedAtOrAbove: 75,
};

function configOf(input: Omit<StrategyConfigInput, 'schemaVersion'>): StrategyConfig {
  return parseStrategyConfig({ schemaVersion: 1, ...input });
}

// O Placar clássico do plan §4: ADX 14 ≥ 25 manda tendência (1,5/0,5), limiares ±2.
export const CLASSIC_CONFIG: StrategyConfig = parseStrategyConfig(loadClassicScoreboard());

// Sem filtro de regime (pesos 1) e limiares ±2: o limiar inclusivo se prova com votos inteiros.
export const FLAT_CONFIG: StrategyConfig = configOf({
  rules: [EMA_RULE, RSI_RULE],
  thresholds: { buy: '2', sell: '-2' },
});

export const SENTIMENT_CONFIG: StrategyConfig = configOf({
  rules: [EMA_RULE, FEAR_GREED_RULE],
  thresholds: { buy: '1', sell: '-1' },
});

// Os sete tipos de regra, sem regime: um voto por família para a tabela de votos e dos rótulos.
export const KINDS_CONFIG: StrategyConfig = configOf({
  rules: [EMA_RULE, MACD_RULE, DONCHIAN_RULE, RSI_RULE, BOLLINGER_RULE, OBV_RULE, FEAR_GREED_RULE],
  thresholds: { buy: '3', sell: '-3' },
});

export const BOLLINGER_DECIMAL_CONFIG: StrategyConfig = configOf({
  rules: [{ ...BOLLINGER_RULE, deviations: '2.3' }],
  thresholds: { buy: '1', sell: '-1' },
});

export type ClassicReadingParams = {
  readonly ema: readonly [fast: number, slow: number];
  readonly macd: readonly [macd: number, signal: number];
  readonly rsi: number;
  readonly obv: readonly [obv: number, ema: number];
  readonly adx: number;
};

function reading(current: RuleReading['current']): RuleReading {
  return { current, previous: undefined };
}

export function classicReadings(params: ClassicReadingParams): ScoreboardReadings {
  const [fast, slow] = params.ema;
  const [macd, signal] = params.macd;
  const [obv, ema] = params.obv;
  return {
    rules: {
      'ema-9-21': reading({ fast, slow }),
      'macd-12-26-9': reading({ macd, signal, histogram: macd - signal }),
      'rsi-14': reading(params.rsi),
      'obv-ema-20': reading({ obv, ema }),
    },
    atr: 410.5,
    adx: { adx: params.adx, plusDi: 28, minusDi: 12 },
  };
}

export function flatReadings(params: {
  readonly ema: readonly [fast: number, slow: number];
  readonly rsi: number;
}): ScoreboardReadings {
  const [fast, slow] = params.ema;
  return {
    rules: { 'ema-9-21': reading({ fast, slow }), 'rsi-14': reading(params.rsi) },
    atr: 410.5,
    adx: undefined,
  };
}

export function sentimentReadings(): ScoreboardReadings {
  return {
    rules: { 'ema-9-21': reading({ fast: 101, slow: 100 }) },
    atr: 410.5,
    adx: undefined,
  };
}
