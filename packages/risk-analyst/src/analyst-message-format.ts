// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '@ativada/strategy-engine';

import { decimalOf } from './analyst-decimal.js';

const TEXT_DECIMAL_PLACES = 2;
const PERCENT_FACTOR = 100;
const MINUS = '−';

// Para onde o número da frase arredonda: perda e custo para CIMA; folga, acerto e volume para BAIXO (A17).
export const TEXT_ROUNDING = {
  UP: EngineDecimal.ROUND_CEIL,
  DOWN: EngineDecimal.ROUND_FLOOR,
} as const;
export type TextRounding = (typeof TEXT_ROUNDING)[keyof typeof TEXT_ROUNDING];

// Número pt-BR com 2 casas e vírgula, arredondado na direção pedida; o menos é o tipográfico (U+2212).
export function formatTextNumber(value: string, rounding: TextRounding): string {
  const rounded = decimalOf(value).toDecimalPlaces(TEXT_DECIMAL_PLACES, rounding);
  const text = rounded.abs().toFixed(TEXT_DECIMAL_PLACES).replace('.', ',');
  return rounded.isNegative() && !rounded.isZero() ? `${MINUS}${text}` : text;
}

// Fração em porcentagem (0,0025 vira "0,25"), sem o sinal de %.
export function formatTextPercent(fraction: string, rounding: TextRounding): string {
  return formatTextNumber(decimalOf(fraction).times(PERCENT_FACTOR).toFixed(), rounding);
}

// "+0,64" ou "−0,64"; zero sai sem sinal.
export function formatSignedTextPercent(fraction: string, rounding: TextRounding): string {
  const text = formatTextPercent(fraction, rounding);
  if (text.startsWith(MINUS) || text === '0,00') return text;
  return `+${text}`;
}

// Inteiro com ponto de milhar (pt-BR): 1204 vira "1.204".
export function formatTextCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
