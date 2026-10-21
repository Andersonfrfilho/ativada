// Copyright (c) 2026 Ada Technology. All rights reserved.

// Leitura de indicador para gente (não é dinheiro): "OBV -961.233.115,7845" vira "OBV −961,2 mi" (a partir de 1 milhão); casas demais caem para 2.
const LONG_NUMBER = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+,\d{3,}/g;
const MILLION = 1_000_000;
const MINUS = '−';
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function readPtBr(text: string): number {
  return Number(text.replaceAll('.', '').replace(',', '.'));
}

function shorten(text: string): string {
  const value = readPtBr(text);
  if (!Number.isFinite(value)) return text;
  const shown = Math.abs(value) >= MILLION ? compact.format(value) : plain.format(value);
  return shown.replace('-', MINUS);
}

export function humanizeReading(text: string): string {
  return text.replace(LONG_NUMBER, shorten);
}
