// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BALCONY_SLOT, type BalconySlot } from '../team-room/balcony/balcony.constant.js';

// As perguntas rápidas da caixa "Pergunte à equipe" (o catálogo fechado de `GET /v1/runs/:runId/questions`, `questions-1`).
// A resposta é do servidor; aqui só o texto do botão e quem responde.
export const ROOM_QUESTION = {
  TREND: 'trend',
  STRETCH: 'stretch',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
  ENTRY_GAP: 'entry_gap',
  PLAN: 'plan',
  TRACK_RECORD: 'track_record',
  BUY_AT: 'buy_at',
} as const;
export type RoomQuestion = (typeof ROOM_QUESTION)[keyof typeof ROOM_QUESTION];

export type RoomQuestionOption = {
  readonly key: RoomQuestion;
  readonly label: string;
  readonly agent: BalconySlot;
};

export const ROOM_QUESTIONS: readonly RoomQuestionOption[] = [
  { key: ROOM_QUESTION.TREND, label: 'Como está a tendência?', agent: BALCONY_SLOT.TIAGO },
  { key: ROOM_QUESTION.STRETCH, label: 'O RSI está esticado?', agent: BALCONY_SLOT.RENATA },
  { key: ROOM_QUESTION.VOLUME, label: 'O volume confirma?', agent: BALCONY_SLOT.VITOR },
  { key: ROOM_QUESTION.SENTIMENT, label: 'Como está o sentimento?', agent: BALCONY_SLOT.SOFIA },
  { key: ROOM_QUESTION.ENTRY_GAP, label: 'O que falta para comprar?', agent: BALCONY_SLOT.ALICE },
  { key: ROOM_QUESTION.PLAN, label: 'Qual é o plano?', agent: BALCONY_SLOT.ALICE },
  {
    key: ROOM_QUESTION.TRACK_RECORD,
    label: 'A previsão tem acertado?',
    agent: BALCONY_SLOT.OTAVIO,
  },
];

// "E se eu comprar a ___?": fora da fileira de botões, tem o próprio campo de preço.
export const BUY_AT_OPTION: RoomQuestionOption = {
  key: ROOM_QUESTION.BUY_AT,
  label: 'E se eu comprar a…?',
  agent: BALCONY_SLOT.ALICE,
};

// O histórico em texto guarda só as últimas respostas.
export const QUESTION_HISTORY_SIZE = 5;

export const ROOM_QUESTIONS_TEXT = {
  TITLE: 'Pergunte à equipe',
  NOTE: 'Respostas da estratégia desta simulação sobre velas já fechadas. Não é recomendação de compra ou venda.',
  SYMBOL: 'Moeda',
  ASKING: 'Perguntando…',
  FAILED: 'Não foi possível perguntar agora. Tente de novo em instantes.',
  HISTORY: 'Perguntas',
  EMPTY: 'Nenhuma pergunta ainda.',
  INDICATIVE: 'Leitura aproximada: muda com a próxima vela.',
  ANSWERED: 'respondeu',
  BUY_AT_LABEL: 'E se eu comprar a (USDT)',
  BUY_AT_HINT:
    'Ex.: 61.000,50. A Alice responde com a proteção, o alvo e o resultado de cada saída, já com as taxas.',
  BUY_AT_INVALID: 'Digite um preço maior que zero, com até 8 casas, por exemplo 61.000,50.',
  BUY_AT_ASK: 'Perguntar sobre este preço',
} as const;
