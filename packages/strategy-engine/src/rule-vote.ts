// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from './engine-candle.types.js';
import { RULE_KIND } from './engine-vocabulary.constant.js';
import {
  missingIndicatorValue,
  readIndicatorOutput,
  readIndicatorScalar,
} from './indicator-reading.js';
import type { RuleReading } from './rule-reading.types.js';
import type { StrategyRule } from './strategy-config.types.js';

export type Vote = -1 | 0 | 1;

export type CastVote = {
  readonly vote: Vote;
  // Só o sentimento pode faltar: sem observação fresca o voto é 0 e o motivo lista "sem dado".
  readonly isMissing: boolean;
};

export type CastRuleVoteParams = {
  readonly rule: StrategyRule;
  readonly reading: RuleReading;
  readonly close: number;
  readonly sentiment: SentimentObservation | null;
};

// Comparações estritas: empate é voto 0.
function compareStrictly(left: number, right: number): Vote {
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

function decided(vote: Vote): CastVote {
  return { vote, isMissing: false };
}

// Fechamento contra o canal do candle ANTERIOR: o valor corrente de Donchian inclui o candle atual.
function voteBreakout(params: {
  readonly ruleId: string;
  readonly reading: RuleReading;
  readonly close: number;
}): Vote {
  const { ruleId, reading, close } = params;
  const upper = readIndicatorOutput({
    value: reading.previous,
    output: 'upper',
    indicatorId: ruleId,
  });
  const lower = readIndicatorOutput({
    value: reading.previous,
    output: 'lower',
    indicatorId: ruleId,
  });
  if (close > upper) return 1;
  return close < lower ? -1 : 0;
}

// Reversão: abaixo do piso compra, acima do teto vende.
function voteOutsideBand(params: {
  readonly value: number;
  readonly floor: number;
  readonly ceiling: number;
}): Vote {
  if (params.value < params.floor) return 1;
  return params.value > params.ceiling ? -1 : 0;
}

// Contrário: medo extremo compra, ganância extrema vende (limites inclusivos).
function castSentimentVote(
  rule: Extract<StrategyRule, { readonly kind: typeof RULE_KIND.FEAR_GREED }>,
  sentiment: SentimentObservation | null,
): CastVote {
  if (sentiment === null) return { vote: 0, isMissing: true };
  if (sentiment.value <= rule.fearAtOrBelow) return decided(1);
  return decided(sentiment.value >= rule.greedAtOrAbove ? -1 : 0);
}

export function castRuleVote(params: CastRuleVoteParams): CastVote {
  const { rule, reading, close } = params;
  const indicatorId = rule.id;
  if (rule.kind !== RULE_KIND.FEAR_GREED && reading.current === undefined) {
    return missingIndicatorValue(indicatorId, 'valor');
  }
  const output = (name: string): number =>
    readIndicatorOutput({ value: reading.current, output: name, indicatorId });
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return decided(compareStrictly(output('fast'), output('slow')));
    case RULE_KIND.MACD:
      return decided(compareStrictly(output('macd'), output('signal')));
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return decided(voteBreakout({ ruleId: indicatorId, reading, close }));
    case RULE_KIND.RSI: {
      const value = readIndicatorScalar({ value: reading.current, indicatorId });
      return decided(voteOutsideBand({ value, floor: rule.oversold, ceiling: rule.overbought }));
    }
    case RULE_KIND.BOLLINGER:
      return decided(
        voteOutsideBand({ value: close, floor: output('lower'), ceiling: output('upper') }),
      );
    case RULE_KIND.OBV_TREND:
      return decided(compareStrictly(output('obv'), output('ema')));
    case RULE_KIND.FEAR_GREED:
      return castSentimentVote(rule, params.sentiment);
  }
}
