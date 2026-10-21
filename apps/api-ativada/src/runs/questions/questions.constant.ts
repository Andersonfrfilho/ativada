// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão das respostas de "Pergunte à equipe": mudar uma regra do ADR 0002 "Perguntas à equipe" exige outra.
export const QUESTIONS_VERSION = 'questions-1' as const;

// As leituras saem das últimas 500 velas fechadas do par, no timeframe da execução: cabe o aquecimento das regras (194 velas
// no Placar clássico, pela convergência das médias) sem ler a série inteira a cada pergunta.
export const QUESTION_CANDLE_WINDOW = 500;

// Memória da instância, limitada: a entrada mais velha sai primeiro.
export const QUESTION_CACHE_MAX_ENTRIES = 256;

// As perguntas rápidas da sala, em catálogo fechado (o painel só escolhe uma delas).
export const QUESTION = {
  TREND: 'trend',
  STRETCH: 'stretch',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
  ENTRY_GAP: 'entry_gap',
  PLAN: 'plan',
  TRACK_RECORD: 'track_record',
} as const;
export type Question = (typeof QUESTION)[keyof typeof QUESTION];

export const QUESTION_AGENT = {
  TIAGO: 'tiago',
  RENATA: 'renata',
  VITOR: 'vitor',
  SOFIA: 'sofia',
  ALICE: 'alice',
  OTAVIO: 'otavio',
} as const;
export type QuestionAgent = (typeof QUESTION_AGENT)[keyof typeof QUESTION_AGENT];

// Quem responde cada pergunta: o especialista da família da regra, a Alice o placar e o plano, o Otávio os acertos.
export const QUESTION_AGENT_OF: Readonly<Record<Question, QuestionAgent>> = {
  [QUESTION.TREND]: QUESTION_AGENT.TIAGO,
  [QUESTION.STRETCH]: QUESTION_AGENT.RENATA,
  [QUESTION.VOLUME]: QUESTION_AGENT.VITOR,
  [QUESTION.SENTIMENT]: QUESTION_AGENT.SOFIA,
  [QUESTION.ENTRY_GAP]: QUESTION_AGENT.ALICE,
  [QUESTION.PLAN]: QUESTION_AGENT.ALICE,
  [QUESTION.TRACK_RECORD]: QUESTION_AGENT.OTAVIO,
};

// `exact`: o número é a leitura gravada ou a conta fechada; `indicative`: o indicador se move com a próxima vela, ou é estimativa.
export const ANSWER_BASIS = { EXACT: 'exact', INDICATIVE: 'indicative' } as const;
export type AnswerBasis = (typeof ANSWER_BASIS)[keyof typeof ANSWER_BASIS];

export const QUESTION_REASON = { NOT_ENABLED: 'not_enabled' } as const;
