// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROOM_QUESTION, type RoomQuestion } from '../room-questions.constant.js';

// Palavras (já sem acento e em minúsculas) que ligam a fala a um par. Casam no começo de uma palavra do texto.
export const SPOKEN_COINS: readonly {
  readonly symbol: string;
  readonly words: readonly string[];
}[] = [
  { symbol: 'BTCUSDT', words: ['bitcoin', 'bit coin', 'btc', 'bitcoim'] },
  { symbol: 'ETHUSDT', words: ['ethereum', 'etherium', 'eterium', 'ether ', 'eth '] },
  { symbol: 'DOGEUSDT', words: ['dogecoin', 'doge'] },
  { symbol: 'SOLUSDT', words: ['solana', 'sol '] },
  { symbol: 'XRPUSDT', words: ['ripple', 'xrp', 'x r p'] },
  { symbol: 'BNBUSDT', words: ['bnb', 'b n b', 'binance coin'] },
  { symbol: 'LINKUSDT', words: ['chainlink', 'chain link', 'link '] },
  { symbol: 'PEPEUSDT', words: ['pepe'] },
  { symbol: 'SHIBUSDT', words: ['shiba', 'shib'] },
];

// Palavras de cada pergunta rápida. Empate de contagem fica com a que vem antes nesta lista.
export const SPOKEN_QUESTIONS: readonly {
  readonly question: RoomQuestion;
  readonly words: readonly string[];
}[] = [
  {
    question: ROOM_QUESTION.TRACK_RECORD,
    words: ['acert', 'previs', 'erran', 'errou', 'otavio', 'historico'],
  },
  {
    question: ROOM_QUESTION.ENTRY_GAP,
    words: ['falta', 'quando compr', 'hora de compr', 'devo compr', 'entrada', 'gatilho', 'placar'],
  },
  { question: ROOM_QUESTION.PLAN, words: ['plano', 'alvo', 'stop', 'protecao', 'alice'] },
  {
    question: ROOM_QUESTION.STRETCH,
    words: ['rsi', 'esticad', 'sobrecomprad', 'sobrevendid', 'renata'],
  },
  { question: ROOM_QUESTION.VOLUME, words: ['volume', 'obv', 'vitor', 'confirma'] },
  {
    question: ROOM_QUESTION.SENTIMENT,
    words: ['sentimento', 'medo', 'ganancia', 'fear', 'greed', 'humor', 'sofia'],
  },
  {
    question: ROOM_QUESTION.TREND,
    words: ['tendencia', 'subindo', 'caindo', 'direcao', 'media movel', 'ema', 'tiago'],
  },
];
