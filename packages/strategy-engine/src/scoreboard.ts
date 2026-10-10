// Copyright (c) 2026 Ada Technology. All rights reserved.
import { flattenIndicatorValue, ruleIndicatorId } from './compute-indicator-series.js';
import type { SentimentObservation } from './engine-candle.types.js';
import type { SignalDecision, SignalVote } from './engine-decision.types.js';
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from './engine-decimal.js';
import type { EngineDecimalValue } from './engine-decimal.js';
import {
  REGIME_FILTER_KIND,
  RULE_FAMILY,
  RULE_KIND,
  SIGNAL_ACTION,
  type SignalAction,
} from './engine-vocabulary.constant.js';
import { REGIME_ADX_INDICATOR_ID, RISK_ATR_INDICATOR_ID } from './engine.constant.js';
import { readIndicatorScalar } from './indicator-reading.js';
import { resolveFamilyWeight, resolveRegime, type ResolvedRegime } from './regime.js';
import { ruleLabel } from './rule-label.js';
import type { RuleReading, ScoreboardReadings } from './rule-reading.types.js';
import { castRuleVote } from './rule-vote.js';
import { buildSignalReason } from './signal-reason.js';
import { resolveFreshSentiment } from './sentiment.js';
import type { StrategyConfig, StrategyRule } from './strategy-config.types.js';

const NO_READING: RuleReading = { current: undefined, previous: undefined };

export type ScoreboardInput = {
  readonly config: StrategyConfig;
  readonly close: number;
  readonly closeTime: number;
  readonly readings: ScoreboardReadings;
  readonly sentiment: SentimentObservation | undefined;
  readonly sentimentSource: string;
};

export type ScoreboardEvaluation = Omit<SignalDecision, 'candleOpenTime'>;

type VoteEntry = { readonly rule: StrategyRule; readonly vote: SignalVote };

// Só a observação da fonte da execução e com até 48 h vota; qualquer outra é dado ausente.
function resolveUsableSentiment(input: ScoreboardInput): SentimentObservation | null {
  const { sentiment } = input;
  if (sentiment === undefined || sentiment.source !== input.sentimentSource) return null;
  return resolveFreshSentiment({ sentiment, closeTime: input.closeTime });
}

function castVotes(params: {
  readonly input: ScoreboardInput;
  readonly regime: ResolvedRegime;
  readonly sentiment: SentimentObservation | null;
}): readonly VoteEntry[] {
  const { input, regime, sentiment } = params;
  return input.config.rules.map((rule) => {
    const cast = castRuleVote({
      rule,
      reading: input.readings.rules[rule.id] ?? NO_READING,
      close: input.close,
      sentiment,
    });
    const family = RULE_FAMILY[rule.kind];
    const weight = resolveFamilyWeight({
      regimeConfig: input.config.regime,
      regime: regime.regime,
      family,
    });
    const vote: SignalVote = {
      ruleId: rule.id,
      family,
      vote: cast.vote,
      weight,
      isMissing: cast.isMissing,
    };
    return { rule, vote };
  });
}

// Soma ponderada em decimal exato: nunca float na pontuação.
function scoreOf(votes: readonly SignalVote[]): EngineDecimalValue {
  return votes.reduce(
    (sum, vote) => sum.plus(toEngineDecimal(vote.weight).times(vote.vote)),
    new EngineDecimal(0),
  );
}

// Limiares inclusivos; as faixas não se sobrepõem (compra > 0 > venda), então não há empate de ação.
function selectAction(
  score: EngineDecimalValue,
  thresholds: StrategyConfig['thresholds'],
): SignalAction {
  if (score.gte(thresholds.buy)) return SIGNAL_ACTION.BUY;
  return score.lte(thresholds.sell) ? SIGNAL_ACTION.SELL : SIGNAL_ACTION.HOLD;
}

function collectIndicators(params: {
  readonly input: ScoreboardInput;
  readonly sentiment: SentimentObservation | null;
}): Readonly<Record<string, number | null>> {
  const { input, sentiment } = params;
  const indicators: Record<string, number | null> = {};
  for (const rule of input.config.rules) {
    const id = ruleIndicatorId(rule.id);
    if (rule.kind === RULE_KIND.FEAR_GREED) {
      indicators[id] = sentiment?.value ?? null;
      continue;
    }
    Object.assign(indicators, flattenIndicatorValue(id, input.readings.rules[rule.id]?.current));
  }
  indicators[RISK_ATR_INDICATOR_ID] = readIndicatorScalar({
    value: input.readings.atr,
    indicatorId: RISK_ATR_INDICATOR_ID,
  });
  if (input.config.regime.kind === REGIME_FILTER_KIND.ADX) {
    Object.assign(indicators, flattenIndicatorValue(REGIME_ADX_INDICATOR_ID, input.readings.adx));
  }
  return indicators;
}

// O placar inteiro, puro: indicadores já lidos → votos, regime, pontuação, ação e motivo. Chamado só
// depois do aquecimento, então valor ausente é erro tipado (só o sentimento pode faltar).
export function evaluateScoreboard(input: ScoreboardInput): ScoreboardEvaluation {
  const sentiment = resolveUsableSentiment(input);
  const regime = resolveRegime({ regime: input.config.regime, adx: input.readings.adx });
  const entries = castVotes({ input, regime, sentiment });
  const votes = entries.map((entry) => entry.vote);
  const score = scoreOf(votes);
  const action = selectAction(score, input.config.thresholds);
  const usesSentiment = input.config.rules.some((rule) => rule.kind === RULE_KIND.FEAR_GREED);
  const reasonVotes = entries.map((entry) => ({
    label: ruleLabel(entry.rule),
    vote: entry.vote.vote,
    isMissing: entry.vote.isMissing,
  }));
  return {
    action,
    score: formatEngineDecimal(score),
    regime: regime.regime,
    votes,
    indicators: collectIndicators({ input, sentiment }),
    sentiment: usesSentiment ? sentiment : null,
    reason: buildSignalReason({ action, score, regime, votes: reasonVotes }),
  };
}
