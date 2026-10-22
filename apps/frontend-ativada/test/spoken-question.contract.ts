// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RoomQuestion } from '../src/runs/trading-room/room-questions.constant.js';
import { matchSpokenQuestion } from '../src/runs/trading-room/voice/match-spoken-question.js';

// Pergunta por voz: a fala transcrita (pt-BR, com ou sem acento, maiúsculas, pontuação) vira uma pergunta rápida e a moeda.

const ENABLED = ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'LINKUSDT'];

const QUESTION_CASES: readonly (readonly [string, RoomQuestion])[] = [
  ['Como está a tendência?', 'trend'],
  ['COMO ESTA A TENDENCIA DO BITCOIN', 'trend'],
  ['Tiago, tá subindo ou caindo?', 'trend'],
  ['Qual a direção do preço agora?', 'trend'],
  ['O RSI está esticado?', 'stretch'],
  ['o preço está sobrecomprado?', 'stretch'],
  ['Renata, tá esticado demais?', 'stretch'],
  ['O volume confirma?', 'volume'],
  ['Vitor, e o volume do ethereum?', 'volume'],
  ['a tendência confirma pelo volume?', 'volume'],
  ['Como está o sentimento do mercado?', 'sentiment'],
  ['O mercado está com medo ou com ganância?', 'sentiment'],
  ['Sofia, como anda o Fear and Greed?', 'sentiment'],
  ['O que falta para comprar?', 'entry_gap'],
  ['Quando comprar bitcoin?', 'entry_gap'],
  ['como está o placar da entrada', 'entry_gap'],
  ['Qual é o plano?', 'plan'],
  ['Qual o alvo e o stop?', 'plan'],
  ['A previsão tem acertado?', 'track_record'],
  ['Otávio, quanto você acertou?', 'track_record'],
  ['as previsões estão errando muito?', 'track_record'],
];

describe('matchSpokenQuestion: a pergunta', () => {
  for (const [text, question] of QUESTION_CASES) {
    test(`"${text}" é ${question}`, () => {
      expect(matchSpokenQuestion(text, ENABLED).question).toBe(question);
    });
  }

  test('fala sem nenhuma palavra do catálogo não vira pergunta', () => {
    for (const text of ['bom dia', '', 'obrigado pela ajuda', '...']) {
      expect(matchSpokenQuestion(text, ENABLED).question).toBeUndefined();
    }
  });
});

const COIN_CASES: readonly (readonly [string, string])[] = [
  ['tendência do bitcoin', 'BTCUSDT'],
  ['tendência do BTC', 'BTCUSDT'],
  ['e o Ethereum?', 'ETHUSDT'],
  ['volume do ETH', 'ETHUSDT'],
  ['a doge está subindo?', 'DOGEUSDT'],
  ['e a Dogecoin?', 'DOGEUSDT'],
  ['a Solana está esticada?', 'SOLUSDT'],
  ['e o SOL?', 'SOLUSDT'],
  ['tendência do ripple', 'XRPUSDT'],
  ['tendência do XRP', 'XRPUSDT'],
  ['qual o plano do BNB', 'BNBUSDT'],
  ['e a Chainlink?', 'LINKUSDT'],
  ['e o LINK?', 'LINKUSDT'],
];

describe('matchSpokenQuestion: a moeda', () => {
  for (const [text, symbol] of COIN_CASES) {
    test(`"${text}" é ${symbol}`, () => {
      const match = matchSpokenQuestion(text, ENABLED);
      expect(match.symbol).toBe(symbol);
      expect(match.unavailableSymbol).toBeUndefined();
    });
  }

  test('sem moeda falada, nenhuma: quem chama mantém a escolhida', () => {
    const match = matchSpokenQuestion('Como está a tendência?', ENABLED);
    expect(match.symbol).toBeUndefined();
    expect(match.unavailableSymbol).toBeUndefined();
  });

  test('moeda falada que não está habilitada vem à parte e não vira a moeda da pergunta', () => {
    for (const [text, symbol] of [
      ['e a pepe?', 'PEPEUSDT'],
      ['tendência da shiba', 'SHIBUSDT'],
      ['e o SHIB?', 'SHIBUSDT'],
    ] as const) {
      const match = matchSpokenQuestion(text, ['BTCUSDT', 'ETHUSDT']);
      expect(match.symbol).toBeUndefined();
      expect(match.unavailableSymbol).toBe(symbol);
    }
  });

  test('palavra que só começa igual não é moeda ("solicitar", "linkado", "ethernet" não casam)', () => {
    for (const text of ['quero solicitar o plano', 'está linkado?', 'cabo ethernet']) {
      const match = matchSpokenQuestion(text, ENABLED);
      expect(match.symbol).toBeUndefined();
      expect(match.unavailableSymbol).toBeUndefined();
    }
  });
});
