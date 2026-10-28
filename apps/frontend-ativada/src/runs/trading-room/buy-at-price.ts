// Copyright (c) 2026 Ada Technology. All rights reserved.

const PRICE_TEXT = /^\d{1,16}(\.\d{1,8})?$/;

// O preço como a pessoa escreve ("61.000,50", "61000.5", "0,00001234") vira texto com ponto decimal, sem `Number`: com vírgula,
// os pontos são milhares; sem vírgula, o ponto é o decimal. `undefined` quando não é um preço positivo de até 8 casas.
export function parseBuyAtPrice(input: string): string | undefined {
  const compact = input.trim().replace(/\s/g, '');
  const text = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  if (!PRICE_TEXT.test(text) || !/[1-9]/.test(text)) return undefined;
  return text;
}
