// Copyright (c) 2026 Ada Technology. All rights reserved.

// Motivo curto de cada especialista (spec 011, D4-A; ADR 0002, "Sala da equipe"): catálogo FECHADO por regra do `analyst-1`.
// "Contra" e "neutro" repetem o texto de `describeRuleCondition` da spec 008 (um contrato prova a igualdade literal);
// `{reading}` vira " (78,2)" quando a regra tem leitura (RSI, Fear & Greed) e some quando não tem.
export type RuleMotive = {
  readonly favor: string;
  readonly against: string;
  readonly neutral: string;
};

export const READING_PLACEHOLDER = '{reading}';

export const RULE_MOTIVE: Readonly<Record<string, RuleMotive>> = {
  'ema-9-21': {
    favor: 'a média rápida (EMA 9) está acima da lenta (EMA 21)',
    against: 'a média rápida (EMA 9) está abaixo da lenta (EMA 21)',
    neutral: 'as médias estão empatadas',
  },
  'macd-12-26-9': {
    favor: 'o MACD está acima da linha de sinal',
    against: 'o MACD ainda está abaixo da linha de sinal',
    neutral: 'o MACD está igual à linha de sinal',
  },
  'donchian-20': {
    favor: 'o preço fechou acima da máxima das últimas 20 velas',
    against: 'o preço fechou abaixo da mínima das últimas 20 velas',
    neutral: 'o preço não fechou acima da máxima das últimas 20 velas',
  },
  'rsi-14': {
    favor: `o RSI${READING_PLACEHOLDER} está abaixo de 30`,
    against: `o RSI${READING_PLACEHOLDER} está acima de 70`,
    neutral: `o RSI${READING_PLACEHOLDER} está entre 30 e 70`,
  },
  'bollinger-20': {
    favor: 'o preço fechou abaixo da banda inferior',
    against: 'o preço fechou acima da banda superior',
    neutral: 'o preço está dentro das bandas',
  },
  'obv-ema-20': {
    favor: 'o volume (OBV) está acima da média dele',
    against: 'o volume (OBV) está abaixo da média dele',
    neutral: 'o volume (OBV) está igual à média dele',
  },
  'fear-greed-25-75': {
    favor: `o Fear & Greed${READING_PLACEHOLDER} está em medo (até 25)`,
    against: `o Fear & Greed${READING_PLACEHOLDER} está em ganância (a partir de 75)`,
    neutral: `o Fear & Greed${READING_PLACEHOLDER} não está em medo (até 25)`,
  },
};

export const CANCELLED_RULES_MOTIVE = 'As regras dele se anulam nesta vela.';
export const WARMING_UP_MOTIVE = 'ainda juntando histórico do par';
export const SENTIMENT_MISSING_MOTIVE = 'sem leitura do Fear & Greed há mais de 48 horas';
