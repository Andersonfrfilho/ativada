// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  IndicatorValue,
  Regime,
  SentimentObservation,
  StrategyFamily,
  StrategyRule,
} from '../../../../packages/strategy-engine/src/index.js';
import { CLASSIC_CONFIG, FLAT_CONFIG, KINDS_CONFIG } from './scoreboard-configs.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';

export const DEFAULT_CLOSE = 100;

export function ruleNamed(id: string): StrategyRule {
  const rule = KINDS_CONFIG.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`Regra ${id} ausente.`);
  return rule;
}

export type VoteCase = {
  readonly label: string;
  readonly ruleId: string;
  readonly current?: IndicatorValue;
  readonly previous?: IndicatorValue;
  readonly close?: number;
  readonly sentiment?: number;
  readonly vote: -1 | 0 | 1;
  readonly isMissing?: boolean;
};

export const DONCHIAN_PREVIOUS = { upper: 100, lower: 90 };
export const DONCHIAN_CURRENT = { upper: 200, lower: 1 };
const BAND = { lower: 90, middle: 100, upper: 110, width: 0.2 };

export const VOTE_CASES: readonly VoteCase[] = [
  {
    label: 'ema_cross: fast above slow',
    ruleId: 'ema-9-21',
    current: { fast: 10, slow: 9 },
    vote: 1,
  },
  {
    label: 'ema_cross: fast below slow',
    ruleId: 'ema-9-21',
    current: { fast: 9, slow: 10 },
    vote: -1,
  },
  { label: 'ema_cross: equal', ruleId: 'ema-9-21', current: { fast: 9, slow: 9 }, vote: 0 },
  {
    label: 'macd: line above signal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.5, signal: 0.4, histogram: 0.1 },
    vote: 1,
  },
  {
    label: 'macd: line below signal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.4, signal: 0.5, histogram: -0.1 },
    vote: -1,
  },
  {
    label: 'macd: equal',
    ruleId: 'macd-12-26-9',
    current: { macd: 0.5, signal: 0.5, histogram: 0 },
    vote: 0,
  },
  {
    label: 'donchian: close above the PREVIOUS high',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 100.01,
    vote: 1,
  },
  {
    label: 'donchian: close equal to the previous high is not a breakout',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 100,
    vote: 0,
  },
  {
    label: 'donchian: inside the channel',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 95,
    vote: 0,
  },
  {
    label: 'donchian: close equal to the previous low is not a breakdown',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 90,
    vote: 0,
  },
  {
    label: 'donchian: close below the PREVIOUS low',
    ruleId: 'donchian-20',
    current: DONCHIAN_CURRENT,
    previous: DONCHIAN_PREVIOUS,
    close: 89.99,
    vote: -1,
  },
  { label: 'rsi: just below oversold', ruleId: 'rsi-14', current: 29.99, vote: 1 },
  { label: 'rsi: at oversold', ruleId: 'rsi-14', current: 30, vote: 0 },
  { label: 'rsi: plateau (50)', ruleId: 'rsi-14', current: 50, vote: 0 },
  { label: 'rsi: at overbought', ruleId: 'rsi-14', current: 70, vote: 0 },
  { label: 'rsi: just above overbought', ruleId: 'rsi-14', current: 70.01, vote: -1 },
  {
    label: 'bollinger: closes below the lower band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 89.99,
    vote: 1,
  },
  {
    label: 'bollinger: closes on the lower band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 90,
    vote: 0,
  },
  {
    label: 'bollinger: closes on the upper band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 110,
    vote: 0,
  },
  {
    label: 'bollinger: closes above the upper band',
    ruleId: 'bollinger-20',
    current: BAND,
    close: 110.01,
    vote: -1,
  },
  {
    label: 'obv_trend: OBV above its EMA',
    ruleId: 'obv-ema-20',
    current: { obv: 2, ema: 1 },
    vote: 1,
  },
  {
    label: 'obv_trend: OBV below its EMA',
    ruleId: 'obv-ema-20',
    current: { obv: 1, ema: 2 },
    vote: -1,
  },
  { label: 'obv_trend: equal', ruleId: 'obv-ema-20', current: { obv: 1, ema: 1 }, vote: 0 },
  {
    label: 'fear_greed: extreme fear buys (contrarian)',
    ruleId: 'fear-greed',
    sentiment: 25,
    vote: 1,
  },
  { label: 'fear_greed: zero buys', ruleId: 'fear-greed', sentiment: 0, vote: 1 },
  { label: 'fear_greed: just above fear is neutral', ruleId: 'fear-greed', sentiment: 26, vote: 0 },
  {
    label: 'fear_greed: just below greed is neutral',
    ruleId: 'fear-greed',
    sentiment: 74,
    vote: 0,
  },
  { label: 'fear_greed: extreme greed sells', ruleId: 'fear-greed', sentiment: 75, vote: -1 },
  { label: 'fear_greed: one hundred sells', ruleId: 'fear-greed', sentiment: 100, vote: -1 },
  {
    label: 'fear_greed: no observation is missing data',
    ruleId: 'fear-greed',
    vote: 0,
    isMissing: true,
  },
];

export function castCase(api: SignalApi, voteCase: VoteCase): { vote: number; isMissing: boolean } {
  const sentiment: SentimentObservation | null =
    voteCase.sentiment === undefined
      ? null
      : { value: voteCase.sentiment, observedAt: 1, source: 'alternative.me' };
  return api.castRuleVote({
    rule: ruleNamed(voteCase.ruleId),
    reading: { current: voteCase.current, previous: voteCase.previous },
    close: voteCase.close ?? DEFAULT_CLOSE,
    sentiment,
  });
}

export function adx(value: number): IndicatorValue {
  return { adx: value, plusDi: 20, minusDi: 10 };
}

export const REGIME_CASES: readonly (readonly [number, Regime])[] = [
  [25, 'trending'],
  [25.0001, 'trending'],
  [24.9999, 'ranging'],
  [24.96, 'ranging'],
  [0, 'ranging'],
  [100, 'trending'],
];

export const WEIGHT_CASES: readonly (readonly [Regime, StrategyFamily, string])[] = [
  ['trending', 'trend', '1.5'],
  ['trending', 'reversion', '0.5'],
  ['trending', 'volume', '1'],
  ['trending', 'sentiment', '1'],
  ['ranging', 'trend', '0.5'],
  ['ranging', 'reversion', '1.5'],
  ['ranging', 'volume', '1'],
  ['ranging', 'sentiment', '1'],
];

export const ADX_FORMAT_CASES: readonly (readonly [number, string])[] = [
  [24.96, '24.9'],
  [24.999999, '24.9'],
  [25, '25.0'],
  [25.04, '25.0'],
  [31.29, '31.2'],
  [31.199999999999996, '31.2'],
  [18.4, '18.4'],
  [0, '0.0'],
  [99.99, '99.9'],
  [100, '100.0'],
];

function voteMismatch(api: SignalApi): string | undefined {
  for (const voteCase of VOTE_CASES) {
    const expected = { vote: voteCase.vote, isMissing: voteCase.isMissing ?? false };
    if (JSON.stringify(castCase(api, voteCase)) !== JSON.stringify(expected)) {
      return voteCase.label;
    }
  }
  return undefined;
}

function regimeMismatch(api: SignalApi): string | undefined {
  for (const [value, expected] of REGIME_CASES) {
    const received = api.resolveRegime({ regime: CLASSIC_CONFIG.regime, adx: adx(value) });
    if (received.regime !== expected || received.adx !== value) return `ADX ${value}`;
  }
  for (const [regime, family, weight] of WEIGHT_CASES) {
    const regimeConfig = CLASSIC_CONFIG.regime;
    if (api.resolveFamilyWeight({ regimeConfig, regime, family }) !== weight) {
      return `peso ${regime}/${family}`;
    }
  }
  const flat = api.resolveFamilyWeight({
    regimeConfig: FLAT_CONFIG.regime,
    regime: 'none',
    family: 'trend',
  });
  return flat === '1' ? undefined : 'peso sem filtro de regime';
}

function adxFormatMismatch(api: SignalApi): string | undefined {
  const wrong = ADX_FORMAT_CASES.find(([value, text]) => api.formatTruncatedAdx(value) !== text);
  return wrong === undefined ? undefined : `ADX ${wrong[0]}`;
}

// Primeira divergência das tabelas de voto, regime, peso e ADX exibido (ou `undefined`): serve ao
// teste e ao laço de mutantes.
export function findFirstRuleMismatch(api: SignalApi): string | undefined {
  return voteMismatch(api) ?? regimeMismatch(api) ?? adxFormatMismatch(api);
}
