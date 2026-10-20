// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RULE_KIND,
  ruleLabel,
  STRATEGY_FAMILY,
  TRIGGER_BASIS,
  type LatestTriggers,
  type RuleKind,
  type RuleTrigger,
  type StrategyConfig,
  type StrategyFamily,
} from '@ativada/strategy-engine';

import { formatPoints } from '../live-status/live-number-format.js';
import { buildTriggerRuleMessage, buildTriggersMessage } from '../live-status/trigger-messages.js';
import {
  describeNoRule,
  describeRuleReading,
  describeSentiment,
  describeWarmingUp,
} from './question-messages.js';
import type { SymbolReadings } from './question-readings.js';
import { ANSWER_BASIS, QUESTION, type AnswerBasis, type Question } from './questions.constant.js';

export type ReadingAnswer = { readonly answer: string; readonly basis: AnswerBasis };

export type ReadingQuestion =
  | typeof QUESTION.TREND
  | typeof QUESTION.STRETCH
  | typeof QUESTION.VOLUME
  | typeof QUESTION.SENTIMENT
  | typeof QUESTION.ENTRY_GAP;

// A família de cada especialista e a regra que ele prefere ler quando a estratégia tem mais de uma.
const RULE_QUESTION: Readonly<
  Record<'trend' | 'stretch' | 'volume', { family: StrategyFamily; kind: RuleKind }>
> = {
  [QUESTION.TREND]: { family: STRATEGY_FAMILY.TREND, kind: RULE_KIND.EMA_CROSS },
  [QUESTION.STRETCH]: { family: STRATEGY_FAMILY.REVERSION, kind: RULE_KIND.RSI },
  [QUESTION.VOLUME]: { family: STRATEGY_FAMILY.VOLUME, kind: RULE_KIND.OBV_TREND },
};

export function isReadingQuestion(question: Question): question is ReadingQuestion {
  return question !== QUESTION.PLAN && question !== QUESTION.TRACK_RECORD;
}

function basisOf(rules: readonly RuleTrigger[]): AnswerBasis {
  return rules.some((rule) => rule.basis === TRIGGER_BASIS.INDICATIVE)
    ? ANSWER_BASIS.INDICATIVE
    : ANSWER_BASIS.EXACT;
}

function pickRule(
  latest: LatestTriggers,
  target: { family: StrategyFamily; kind: RuleKind },
): RuleTrigger | undefined {
  const { rules } = latest.triggers;
  return (
    rules.find((rule) => rule.kind === target.kind) ??
    rules.find((rule) => rule.family === target.family)
  );
}

type AnswerParams = {
  readonly symbol: string;
  readonly config: StrategyConfig;
  readonly latest: LatestTriggers;
};

function describeRule(params: AnswerParams & { readonly trigger: RuleTrigger }): string {
  const { trigger } = params;
  const rule = params.config.rules.find((item) => item.id === trigger.ruleId);
  const label = rule === undefined ? trigger.ruleId : ruleLabel(rule);
  const state = params.latest.triggers.state;
  return describeRuleReading({
    symbol: params.symbol,
    label,
    family: trigger.family,
    vote: trigger.vote,
    trigger: trigger.isMet ? undefined : buildTriggerRuleMessage({ rule: trigger, label, state }),
  });
}

function answerRule(
  params: AnswerParams & { readonly question: 'trend' | 'stretch' | 'volume' },
): ReadingAnswer {
  const target = RULE_QUESTION[params.question];
  const trigger = pickRule(params.latest, target);
  if (trigger === undefined)
    return { answer: describeNoRule(target.family), basis: ANSWER_BASIS.EXACT };
  return { answer: describeRule({ ...params, trigger }), basis: basisOf([trigger]) };
}

function answerSentiment(
  params: AnswerParams & { readonly readings: SymbolReadings },
): ReadingAnswer {
  const trigger = params.latest.triggers.rules.find((rule) => rule.kind === RULE_KIND.FEAR_GREED);
  const lead = describeSentiment({
    value: params.readings.sentiment?.value,
    isScored: trigger !== undefined,
  });
  if (trigger === undefined) return { answer: lead, basis: ANSWER_BASIS.EXACT };
  return { answer: `${lead} ${describeRule({ ...params, trigger })}`, basis: basisOf([trigger]) };
}

function answerEntryGap(params: AnswerParams): ReadingAnswer {
  const { triggers } = params.latest;
  const lead = `Em ${params.symbol}, o placar está em ${formatPoints(triggers.score)}.`;
  return {
    answer: `${lead} ${buildTriggersMessage(triggers)}`,
    basis: basisOf(triggers.rules),
  };
}

// As perguntas que a leitura do placar responde. Sem sinal (aquecimento) o par ainda não tem a leitura.
export function answerReadingQuestion(params: {
  readonly question: ReadingQuestion;
  readonly symbol: string;
  readonly config: StrategyConfig;
  readonly readings: SymbolReadings;
}): ReadingAnswer {
  const { question, readings } = params;
  const latest = readings.latest;
  if (latest === null && question === QUESTION.SENTIMENT) {
    const isScored = params.config.rules.some((rule) => rule.kind === RULE_KIND.FEAR_GREED);
    const value = readings.sentiment?.value;
    return { answer: describeSentiment({ value, isScored }), basis: ANSWER_BASIS.EXACT };
  }
  if (latest === null)
    return { answer: describeWarmingUp(params.symbol), basis: ANSWER_BASIS.EXACT };
  const base = { symbol: params.symbol, config: params.config, latest };
  if (question === QUESTION.SENTIMENT) return answerSentiment({ ...base, readings });
  if (question === QUESTION.ENTRY_GAP) return answerEntryGap(base);
  return answerRule({ ...base, question });
}
