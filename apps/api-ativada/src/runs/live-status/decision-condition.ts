// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RULE_KIND, type SignalVote, type StrategyRule } from '@ativada/strategy-engine';

import { formatReading } from './live-number-format.js';

export type RuleConditionParams = {
  readonly rule: StrategyRule;
  // Só os votos que não foram a favor explicam uma espera: contra (-1) ou neutro (0).
  readonly vote: Exclude<SignalVote['vote'], 1>;
  // A leitura gravada da regra (RSI, Fear & Greed); as demais regras dispensam o valor.
  readonly reading: number | undefined;
};

type Condition = Readonly<Record<'against' | 'neutral', string>>;
type RuleOf<TKind extends StrategyRule['kind']> = Extract<StrategyRule, { readonly kind: TKind }>;

const MACD_CONDITION: Condition = {
  against: 'o MACD ainda está abaixo da linha de sinal',
  neutral: 'o MACD está igual à linha de sinal',
};
const BOLLINGER_CONDITION: Condition = {
  against: 'o preço fechou acima da banda superior',
  neutral: 'o preço está dentro das bandas',
};
const OBV_CONDITION: Condition = {
  against: 'o volume (OBV) está abaixo da média dele',
  neutral: 'o volume (OBV) está igual à média dele',
};

function withReading(reading: number | undefined): string {
  return reading === undefined ? '' : ` (${formatReading(reading)})`;
}

function describeEma(rule: RuleOf<typeof RULE_KIND.EMA_CROSS>): Condition {
  return {
    against: `a média rápida (EMA ${rule.fastPeriod}) está abaixo da lenta (EMA ${rule.slowPeriod})`,
    neutral: 'as médias estão empatadas',
  };
}

function describeDonchian(rule: RuleOf<typeof RULE_KIND.DONCHIAN_BREAKOUT>): Condition {
  return {
    against: `o preço fechou abaixo da mínima das últimas ${rule.period} velas`,
    neutral: `o preço não fechou acima da máxima das últimas ${rule.period} velas`,
  };
}

function describeRsi(rule: RuleOf<typeof RULE_KIND.RSI>, reading: number | undefined): Condition {
  const subject = `o RSI${withReading(reading)}`;
  return {
    against: `${subject} está acima de ${rule.overbought}`,
    neutral: `${subject} está entre ${rule.oversold} e ${rule.overbought}`,
  };
}

function describeFearGreed(
  rule: RuleOf<typeof RULE_KIND.FEAR_GREED>,
  reading: number | undefined,
): Condition {
  const subject = `o Fear & Greed${withReading(reading)}`;
  return {
    against: `${subject} está em ganância (a partir de ${rule.greedAtOrAbove})`,
    neutral: `${subject} não está em medo (até ${rule.fearAtOrBelow})`,
  };
}

function describeKind(rule: StrategyRule, reading: number | undefined): Condition {
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return describeEma(rule);
    case RULE_KIND.MACD:
      return MACD_CONDITION;
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return describeDonchian(rule);
    case RULE_KIND.RSI:
      return describeRsi(rule, reading);
    case RULE_KIND.BOLLINGER:
      return BOLLINGER_CONDITION;
    case RULE_KIND.OBV_TREND:
      return OBV_CONDITION;
    case RULE_KIND.FEAR_GREED:
      return describeFearGreed(rule, reading);
  }
}

// O que a regra viu, em palavras, quando ela NÃO votou a favor (ADR 0002, spec 008, L15): a frase depende só do voto
// gravado e dos parâmetros da regra, nunca de um limiar novo.
export function describeRuleCondition(params: RuleConditionParams): string {
  const condition = describeKind(params.rule, params.reading);
  return params.vote === -1 ? condition.against : condition.neutral;
}
