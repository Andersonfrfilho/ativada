// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RoomQuestion } from '../room-questions.constant.js';
import { SPOKEN_COINS, SPOKEN_QUESTIONS } from './spoken-words.constant.js';

export type SpokenMatch = {
  // A pergunta rápida reconhecida; ausente quando nenhuma palavra casa.
  readonly question: RoomQuestion | undefined;
  // O par falado, só se habilitado; ausente = quem chama mantém a moeda escolhida.
  readonly symbol: string | undefined;
  // O par falado que não está habilitado aqui (a tela avisa e mantém a moeda escolhida).
  readonly unavailableSymbol: string | undefined;
};

// Minúsculas, sem acento e sem pontuação, com espaço nas pontas: cada palavra-chave casa no começo de uma palavra.
export function normalizeSpokenText(text: string): string {
  const plain = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${plain} `;
}

function countHits(text: string, words: readonly string[]): number {
  return words.filter((word) => text.includes(` ${word}`)).length;
}

function matchQuestion(text: string): RoomQuestion | undefined {
  let best: { readonly question: RoomQuestion; readonly hits: number } | undefined;
  for (const entry of SPOKEN_QUESTIONS) {
    const hits = countHits(text, entry.words);
    if (hits > (best?.hits ?? 0)) best = { question: entry.question, hits };
  }
  return best?.question;
}

function matchCoin(text: string): string | undefined {
  return SPOKEN_COINS.find((coin) => countHits(text, coin.words) > 0)?.symbol;
}

// Pura: a fala transcrita vira uma das perguntas rápidas e, se dita, a moeda. Nada aqui chama o servidor.
export function matchSpokenQuestion(text: string, enabledSymbols: readonly string[]): SpokenMatch {
  const normalized = normalizeSpokenText(text);
  const spoken = matchCoin(normalized);
  const isEnabled = spoken !== undefined && enabledSymbols.includes(spoken);
  return {
    question: matchQuestion(normalized),
    symbol: isEnabled ? spoken : undefined,
    unavailableSymbol: spoken !== undefined && !isEnabled ? spoken : undefined,
  };
}
