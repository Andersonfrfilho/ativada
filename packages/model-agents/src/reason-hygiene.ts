// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HIDDEN_REASON_PHRASE } from './model-agents-messages.js';
import { OPINION_REASON_MAX_LENGTH } from './model-opinion.schema.js';

// RF08 / RNF07: palavra que soa a promessa ou a conselho. A busca é por trecho, sem diferenciar maiúscula.
export const FORBIDDEN_REASON_WORDS: readonly string[] = [
  'vai subir',
  'garantido',
  'recomendamos',
  'compre',
  'venda',
  'confiante',
  'certeza',
];

export type SanitizedReason = { readonly reason: string; readonly reasonHidden: boolean };

const SPACE_LIKE_CODES: readonly number[] = [9, 10, 13, 0x2028, 0x2029];
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

function isControlCode(code: number): boolean {
  return code < 32 || (code >= 127 && code <= 159);
}

// Quebra de linha vira espaço (as palavras não se colam); os demais caracteres de controle somem.
function stripControls(text: string): string {
  let cleaned = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (SPACE_LIKE_CODES.includes(code)) cleaned += ' ';
    else if (!isControlCode(code)) cleaned += character;
  }
  return cleaned.replace(/ {2,}/g, ' ').trim();
}

function cutToLimit(text: string): string {
  const cut = text.slice(0, OPINION_REASON_MAX_LENGTH);
  const lastCode = cut.charCodeAt(cut.length - 1);
  const isSplitPair = lastCode >= HIGH_SURROGATE_START && lastCode <= HIGH_SURROGATE_END;
  return isSplitPair ? cut.slice(0, -1) : cut;
}

function hasForbiddenWord(text: string): boolean {
  const lowerText = text.toLowerCase();
  return FORBIDDEN_REASON_WORDS.some((word) => lowerText.includes(word));
}

// A busca roda no texto limpo INTEIRO, antes do corte: cortar não esconde uma palavra proibida.
export function sanitizeReason(rawReason: string): SanitizedReason {
  const cleaned = stripControls(rawReason);
  if (cleaned === '' || hasForbiddenWord(cleaned)) {
    return { reason: HIDDEN_REASON_PHRASE, reasonHidden: true };
  }
  return { reason: cutToLimit(cleaned), reasonHidden: false };
}
