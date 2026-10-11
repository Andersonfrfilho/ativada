// Copyright (c) 2026 Ada Technology. All rights reserved.
const PERCENT_PATTERN = /^\d+(\.\d+)?$/;
const PERCENT_SHIFT_DIGITS = 2;

// "2.5" (%) vira "0.025" (fração) movendo a vírgula no texto: nunca passa por número de ponto flutuante.
export function percentToFraction(percentText: string): string | undefined {
  const trimmed = percentText.trim();
  if (!PERCENT_PATTERN.test(trimmed)) return undefined;
  const [whole = '', decimals = ''] = trimmed.split('.');
  const padded = whole.padStart(PERCENT_SHIFT_DIGITS + 1, '0');
  const cut = padded.length - PERCENT_SHIFT_DIGITS;
  const wholePart = padded.slice(0, cut).replace(/^0+(?=\d)/, '');
  const decimalPart = `${padded.slice(cut)}${decimals}`.replace(/0+$/, '');
  return decimalPart === '' ? wholePart : `${wholePart}.${decimalPart}`;
}
