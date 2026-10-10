// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RULE_FAMILY,
  SIGNAL_ACTION,
  type Regime,
  type RuleKind,
  type ScoreboardReadings,
  type SentimentObservation,
  type SignalAction,
  type SignalDecision,
  type StrategyConfig,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  CLASSIC_CONFIG,
  classicReadings,
  CLOSE_TIME,
  FLAT_CONFIG,
  flatReadings,
  FORTY_EIGHT_HOURS,
  KINDS_CONFIG,
  BOLLINGER_DECIMAL_CONFIG,
  SENTIMENT_CONFIG,
  SENTIMENT_SOURCE,
  sentimentReadings,
  type ClassicReadingParams,
} from './scoreboard-configs.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';

export type ExpectedVote = readonly [
  ruleId: string,
  vote: -1 | 0 | 1,
  weight: string,
  isMissing?: boolean,
];

export type ScoreboardScenario = {
  readonly name: string;
  readonly config: StrategyConfig;
  readonly readings: ScoreboardReadings;
  readonly close?: number;
  readonly sentiment?: SentimentObservation;
  readonly action: SignalAction;
  readonly score: string;
  readonly regime: Regime;
  readonly votes: readonly ExpectedVote[];
  readonly reason: string;
  readonly usedSentiment?: SentimentObservation;
};

const DEFAULT_CLOSE = 100;
const { BUY, SELL, HOLD } = SIGNAL_ACTION;

function classic(
  name: string,
  readings: ClassicReadingParams,
  expected: Omit<ScoreboardScenario, 'name' | 'config' | 'readings'>,
): ScoreboardScenario {
  return { name, config: CLASSIC_CONFIG, readings: classicReadings(readings), ...expected };
}

const ALL_NEUTRAL = {
  ema: [100, 100],
  macd: [1, 1],
  rsi: 50,
  obv: [900, 900],
  adx: 40,
} as const satisfies ClassicReadingParams;

const TRENDING_VOTES = (
  ema: -1 | 0 | 1,
  macd: -1 | 0 | 1,
  rsi: -1 | 0 | 1,
  obv: -1 | 0 | 1,
): readonly ExpectedVote[] => [
  ['ema-9-21', ema, '1.5'],
  ['macd-12-26-9', macd, '1.5'],
  ['rsi-14', rsi, '0.5'],
  ['obv-ema-20', obv, '1'],
];

const RANGING_VOTES = (
  ema: -1 | 0 | 1,
  macd: -1 | 0 | 1,
  rsi: -1 | 0 | 1,
  obv: -1 | 0 | 1,
): readonly ExpectedVote[] => [
  ['ema-9-21', ema, '0.5'],
  ['macd-12-26-9', macd, '0.5'],
  ['rsi-14', rsi, '1.5'],
  ['obv-ema-20', obv, '1'],
];

const CLASSIC_SCENARIOS: readonly ScoreboardScenario[] = [
  classic(
    'trend: 3 of 4 rules buy, RSI neutral',
    { ema: [101, 100], macd: [1.2, 1], rsi: 55, obv: [1000, 900], adx: 31.29 },
    {
      action: BUY,
      score: '4',
      regime: 'trending',
      votes: TRENDING_VOTES(1, 1, 0, 1),
      reason:
        'Compra · pontuação +4 · tendência (ADX 31.2) · compra: EMA 9×21, MACD 12/26/9, OBV×EMA 20 · venda: nenhuma · neutras: RSI 14',
    },
  ),
  classic(
    'same votes, ADX exactly at the threshold: trending weights, buy',
    { ema: [101, 100], macd: [1.2, 1], rsi: 80, obv: [900, 900], adx: 25 },
    {
      action: BUY,
      score: '2.5',
      regime: 'trending',
      votes: TRENDING_VOTES(1, 1, -1, 0),
      reason:
        'Compra · pontuação +2.5 · tendência (ADX 25.0) · compra: EMA 9×21, MACD 12/26/9 · venda: RSI 14 · neutras: OBV×EMA 20',
    },
  ),
  classic(
    'same votes, ADX 24.96: ranging weights, hold, ADX printed truncated (24.9, never 25.0)',
    { ema: [101, 100], macd: [1.2, 1], rsi: 80, obv: [900, 900], adx: 24.96 },
    {
      action: HOLD,
      score: '-0.5',
      regime: 'ranging',
      votes: RANGING_VOTES(1, 1, -1, 0),
      reason:
        'Neutro · pontuação -0.5 · lateral (ADX 24.9) · compra: EMA 9×21, MACD 12/26/9 · venda: RSI 14 · neutras: OBV×EMA 20',
    },
  ),
  classic(
    'ADX 24.999999 is still ranging and prints 24.9',
    { ...ALL_NEUTRAL, adx: 24.999999 },
    {
      action: HOLD,
      score: '0',
      regime: 'ranging',
      votes: RANGING_VOTES(0, 0, 0, 0),
      reason:
        'Neutro · pontuação 0 · lateral (ADX 24.9) · compra: nenhuma · venda: nenhuma · neutras: EMA 9×21, MACD 12/26/9, RSI 14, OBV×EMA 20',
    },
  ),
  classic(
    'range: reversion weighs more but 3 buys against 1 sell stay below the limit',
    { ema: [101, 100], macd: [1.2, 1], rsi: 25, obv: [800, 900], adx: 18.4 },
    {
      action: HOLD,
      score: '1.5',
      regime: 'ranging',
      votes: RANGING_VOTES(1, 1, 1, -1),
      reason:
        'Neutro · pontuação +1.5 · lateral (ADX 18.4) · compra: EMA 9×21, MACD 12/26/9, RSI 14 · venda: OBV×EMA 20 · neutras: nenhuma',
    },
  ),
  classic(
    'score exactly at the buy limit (+2) buys',
    { ...ALL_NEUTRAL, ema: [101, 100], rsi: 25 },
    {
      action: BUY,
      score: '2',
      regime: 'trending',
      votes: TRENDING_VOTES(1, 0, 1, 0),
      reason:
        'Compra · pontuação +2 · tendência (ADX 40.0) · compra: EMA 9×21, RSI 14 · venda: nenhuma · neutras: MACD 12/26/9, OBV×EMA 20',
    },
  ),
  classic(
    'score exactly at the sell limit (−2) sells',
    { ...ALL_NEUTRAL, ema: [99, 100], rsi: 80 },
    {
      action: SELL,
      score: '-2',
      regime: 'trending',
      votes: TRENDING_VOTES(-1, 0, -1, 0),
      reason:
        'Venda · pontuação -2 · tendência (ADX 40.0) · compra: nenhuma · venda: EMA 9×21, RSI 14 · neutras: MACD 12/26/9, OBV×EMA 20',
    },
  ),
  classic(
    'score +1.5, just below the buy limit, holds',
    { ...ALL_NEUTRAL, ema: [101, 100] },
    {
      action: HOLD,
      score: '1.5',
      regime: 'trending',
      votes: TRENDING_VOTES(1, 0, 0, 0),
      reason:
        'Neutro · pontuação +1.5 · tendência (ADX 40.0) · compra: EMA 9×21 · venda: nenhuma · neutras: MACD 12/26/9, RSI 14, OBV×EMA 20',
    },
  ),
  classic('every vote is zero', ALL_NEUTRAL, {
    action: HOLD,
    score: '0',
    regime: 'trending',
    votes: TRENDING_VOTES(0, 0, 0, 0),
    reason:
      'Neutro · pontuação 0 · tendência (ADX 40.0) · compra: nenhuma · venda: nenhuma · neutras: EMA 9×21, MACD 12/26/9, RSI 14, OBV×EMA 20',
  }),
  classic(
    'tie: a buy and a sell of the same weight cancel out',
    { ...ALL_NEUTRAL, ema: [101, 100], macd: [0.8, 1] },
    {
      action: HOLD,
      score: '0',
      regime: 'trending',
      votes: TRENDING_VOTES(1, -1, 0, 0),
      reason:
        'Neutro · pontuação 0 · tendência (ADX 40.0) · compra: EMA 9×21 · venda: MACD 12/26/9 · neutras: RSI 14, OBV×EMA 20',
    },
  ),
  classic(
    'trend: every rule sells',
    { ema: [99, 100], macd: [0.8, 1], rsi: 80, obv: [800, 900], adx: 40 },
    {
      action: SELL,
      score: '-4.5',
      regime: 'trending',
      votes: TRENDING_VOTES(-1, -1, -1, -1),
      reason:
        'Venda · pontuação -4.5 · tendência (ADX 40.0) · compra: nenhuma · venda: EMA 9×21, MACD 12/26/9, RSI 14, OBV×EMA 20 · neutras: nenhuma',
    },
  ),
];

function flat(
  name: string,
  readings: ScoreboardReadings,
  expected: Omit<ScoreboardScenario, 'name' | 'config' | 'readings' | 'regime'>,
): ScoreboardScenario {
  return { name, config: FLAT_CONFIG, readings, regime: 'none', ...expected };
}

const FLAT_VOTES = (ema: -1 | 0 | 1, rsi: -1 | 0 | 1): readonly ExpectedVote[] => [
  ['ema-9-21', ema, '1'],
  ['rsi-14', rsi, '1'],
];

const FLAT_SCENARIOS: readonly ScoreboardScenario[] = [
  flat(
    'no regime filter: two buys reach +2 exactly and buy',
    flatReadings({ ema: [101, 100], rsi: 25 }),
    {
      action: BUY,
      score: '2',
      votes: FLAT_VOTES(1, 1),
      reason:
        'Compra · pontuação +2 · sem filtro de regime · compra: EMA 9×21, RSI 14 · venda: nenhuma · neutras: nenhuma',
    },
  ),
  flat(
    'no regime filter: two sells reach −2 exactly and sell',
    flatReadings({ ema: [99, 100], rsi: 80 }),
    {
      action: SELL,
      score: '-2',
      votes: FLAT_VOTES(-1, -1),
      reason:
        'Venda · pontuação -2 · sem filtro de regime · compra: nenhuma · venda: EMA 9×21, RSI 14 · neutras: nenhuma',
    },
  ),
  flat('no regime filter: one buy is +1 and holds', flatReadings({ ema: [101, 100], rsi: 50 }), {
    action: HOLD,
    score: '1',
    votes: FLAT_VOTES(1, 0),
    reason:
      'Neutro · pontuação +1 · sem filtro de regime · compra: EMA 9×21 · venda: nenhuma · neutras: RSI 14',
  }),
];

const FEAR_GREED_WEIGHT = '1';
const FEAR_GREED_ID = 'fear-greed';

function observationAged(
  value: number,
  ageMilliseconds: number,
  source = SENTIMENT_SOURCE,
): SentimentObservation {
  return { value, observedAt: CLOSE_TIME - ageMilliseconds, source };
}

function withSentiment(
  name: string,
  sentiment: SentimentObservation | undefined,
  expected: Omit<ScoreboardScenario, 'name' | 'config' | 'readings' | 'regime' | 'sentiment'>,
): ScoreboardScenario {
  return {
    name,
    config: SENTIMENT_CONFIG,
    readings: sentimentReadings(),
    regime: 'none',
    ...(sentiment === undefined ? {} : { sentiment }),
    ...expected,
  };
}

const SENTIMENT_VOTES = (fearGreed: -1 | 0 | 1, isMissing: boolean): readonly ExpectedVote[] => [
  ['ema-9-21', 1, '1'],
  [FEAR_GREED_ID, fearGreed, FEAR_GREED_WEIGHT, isMissing],
];

const MISSING_REASON =
  'Compra · pontuação +1 · sem filtro de regime · compra: EMA 9×21 · venda: nenhuma · neutras: nenhuma · sem dado: Fear & Greed';
const FRESH_AT_LIMIT = observationAged(20, FORTY_EIGHT_HOURS);

const SENTIMENT_SCENARIOS: readonly ScoreboardScenario[] = [
  withSentiment('sentiment absent: vote 0 flagged as missing data', undefined, {
    action: BUY,
    score: '1',
    votes: SENTIMENT_VOTES(0, true),
    reason: MISSING_REASON,
  }),
  withSentiment('sentiment exactly 48 h old is still fresh (extreme fear buys)', FRESH_AT_LIMIT, {
    action: BUY,
    score: '2',
    votes: SENTIMENT_VOTES(1, false),
    reason:
      'Compra · pontuação +2 · sem filtro de regime · compra: EMA 9×21, Fear & Greed · venda: nenhuma · neutras: nenhuma',
    usedSentiment: FRESH_AT_LIMIT,
  }),
  withSentiment(
    'sentiment 48 h + 1 ms old is stale: missing data',
    observationAged(20, FORTY_EIGHT_HOURS + 1),
    { action: BUY, score: '1', votes: SENTIMENT_VOTES(0, true), reason: MISSING_REASON },
  ),
  withSentiment(
    'sentiment from another source never votes',
    observationAged(20, 0, 'outra-fonte'),
    { action: BUY, score: '1', votes: SENTIMENT_VOTES(0, true), reason: MISSING_REASON },
  ),
  withSentiment('fresh extreme greed sells and cancels the buy', observationAged(80, 0), {
    action: HOLD,
    score: '0',
    votes: SENTIMENT_VOTES(-1, false),
    reason:
      'Neutro · pontuação 0 · sem filtro de regime · compra: EMA 9×21 · venda: Fear & Greed · neutras: nenhuma',
    usedSentiment: observationAged(80, 0),
  }),
  withSentiment('fresh middle value is a neutral vote, not missing data', observationAged(50, 0), {
    action: BUY,
    score: '1',
    votes: SENTIMENT_VOTES(0, false),
    reason:
      'Compra · pontuação +1 · sem filtro de regime · compra: EMA 9×21 · venda: nenhuma · neutras: Fear & Greed',
    usedSentiment: observationAged(50, 0),
  }),
];

const DONCHIAN_PREVIOUS = { upper: 99, lower: 90 };

function kindsReadings(): ScoreboardReadings {
  return {
    rules: {
      'ema-9-21': { current: { fast: 101, slow: 100 }, previous: undefined },
      'macd-12-26-9': { current: { macd: 0.5, signal: 0.7, histogram: -0.2 }, previous: undefined },
      // Máxima corrente 101 anularia o rompimento; só a do candle anterior (99) o dá.
      'donchian-20': { current: { upper: 101, lower: 80 }, previous: DONCHIAN_PREVIOUS },
      'rsi-14': { current: 50, previous: undefined },
      'bollinger-20': {
        current: { lower: 90, middle: 95, upper: 99.5, width: 0.1 },
        previous: undefined,
      },
      'obv-ema-20': { current: { obv: 900, ema: 900 }, previous: undefined },
    },
    atr: 410.5,
    adx: undefined,
  };
}

const OTHER_SCENARIOS: readonly ScoreboardScenario[] = [
  {
    name: 'the seven rule kinds: labels, previous-candle breakout and missing sentiment',
    config: KINDS_CONFIG,
    readings: kindsReadings(),
    regime: 'none',
    action: HOLD,
    score: '0',
    votes: [
      ['ema-9-21', 1, '1'],
      ['macd-12-26-9', -1, '1'],
      ['donchian-20', 1, '1'],
      ['rsi-14', 0, '1'],
      ['bollinger-20', -1, '1'],
      ['obv-ema-20', 0, '1'],
      [FEAR_GREED_ID, 0, '1', true],
    ],
    reason:
      'Neutro · pontuação 0 · sem filtro de regime · compra: EMA 9×21, Donchian 20 · venda: MACD 12/26/9, Bollinger 20/2 · neutras: RSI 14, OBV×EMA 20 · sem dado: Fear & Greed',
  },
  {
    name: 'the Bollinger label spells a one-decimal deviation as written',
    config: BOLLINGER_DECIMAL_CONFIG,
    readings: {
      rules: {
        'bollinger-20': {
          current: { lower: 99, middle: 100, upper: 101, width: 0.02 },
          previous: undefined,
        },
      },
      atr: 410.5,
      adx: undefined,
    },
    regime: 'none',
    action: HOLD,
    score: '0',
    votes: [['bollinger-20', 0, '1']],
    reason:
      'Neutro · pontuação 0 · sem filtro de regime · compra: nenhuma · venda: nenhuma · neutras: Bollinger 20/2.3',
  },
];

export const SCOREBOARD_SCENARIOS: readonly ScoreboardScenario[] = [
  ...CLASSIC_SCENARIOS,
  ...FLAT_SCENARIOS,
  ...SENTIMENT_SCENARIOS,
  ...OTHER_SCENARIOS,
];

export type ComparableEvaluation = {
  readonly action: SignalAction;
  readonly score: string;
  readonly regime: Regime;
  readonly votes: readonly ExpectedVote[];
  readonly reason: string;
  readonly sentiment: SentimentObservation | null;
};

export function expectedOf(scenario: ScoreboardScenario): ComparableEvaluation {
  return {
    action: scenario.action,
    score: scenario.score,
    regime: scenario.regime,
    votes: scenario.votes.map(([ruleId, vote, weight, isMissing]) => [
      ruleId,
      vote,
      weight,
      isMissing ?? false,
    ]),
    reason: scenario.reason,
    sentiment: scenario.usedSentiment ?? null,
  };
}

type EvaluatedDecision = Omit<SignalDecision, 'candleOpenTime'>;

export function evaluateScenario(api: SignalApi, scenario: ScoreboardScenario): EvaluatedDecision {
  return api.evaluateScoreboard({
    config: scenario.config,
    close: scenario.close ?? DEFAULT_CLOSE,
    closeTime: CLOSE_TIME,
    readings: scenario.readings,
    sentiment: scenario.sentiment,
    sentimentSource: SENTIMENT_SOURCE,
  });
}

export function comparableOf(decision: EvaluatedDecision): ComparableEvaluation {
  return {
    action: decision.action,
    score: decision.score,
    regime: decision.regime,
    votes: decision.votes.map((vote) => [vote.ruleId, vote.vote, vote.weight, vote.isMissing]),
    reason: decision.reason,
    sentiment: decision.sentiment,
  };
}

function ruleKindOf(scenario: ScoreboardScenario, ruleId: string): RuleKind {
  const rule = scenario.config.rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) throw new Error(`Regra ${ruleId} ausente da configuração.`);
  return rule.kind;
}

// A família do voto é a da regra (RULE_FAMILY), qualquer que seja o regime.
export function familiesMismatch(
  scenario: ScoreboardScenario,
  decision: EvaluatedDecision,
): boolean {
  return decision.votes.some(
    (vote) => vote.family !== RULE_FAMILY[ruleKindOf(scenario, vote.ruleId)],
  );
}

export function findFirstMismatch(api: SignalApi): string | undefined {
  for (const scenario of SCOREBOARD_SCENARIOS) {
    const decision = evaluateScenario(api, scenario);
    const isSame =
      JSON.stringify(comparableOf(decision)) === JSON.stringify(expectedOf(scenario)) &&
      !familiesMismatch(scenario, decision);
    if (!isSame) return scenario.name;
  }
  return undefined;
}
