// Copyright (c) 2026 Ada Technology. All rights reserved.
type PriceFormatOption = {
  readonly type: 'custom';
  readonly formatter: (value: number) => string;
  readonly minMove: number;
};

export type { PriceFormatOption };

const MINUS_SIGN = '−';
export const DEFAULT_PRECISION = 2;
const MAX_PRECISION = 8;

// Casas decimais do eixo de preço pela grandeza do preço (as da corretora: BTC 2, LINK 3, XRP 4, SHIB 8).
const PRECISION_BY_FLOOR: readonly (readonly [number, number])[] = [
  [100, 2],
  [10, 3],
  [1, 4],
  [0.1, 5],
  [0.01, 6],
  [0.001, 7],
];

const priceFormats = new Map<number, Intl.NumberFormat>();
const scoreFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const volumeFormat = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function priceFormatFor(precision: number): Intl.NumberFormat {
  const cached = priceFormats.get(precision);
  if (cached !== undefined) return cached;
  const format = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  priceFormats.set(precision, format);
  return format;
}

// O sinal de menos de verdade (U+2212), o mesmo do resto do painel; o `Intl` entrega o hífen.
function withTrueMinus(text: string): string {
  return text.replace('-', MINUS_SIGN);
}

// Só desenho: a biblioteca pede número para escalar o eixo. O dinheiro do painel segue em texto e BigInt.
export function pricePrecisionFor(reference: number): number {
  if (!Number.isFinite(reference) || reference <= 0) return DEFAULT_PRECISION;
  const match = PRECISION_BY_FLOOR.find(([floor]) => reference >= floor);
  return match?.[1] ?? MAX_PRECISION;
}

export function formatAxisPrice(value: number, precision: number): string {
  return withTrueMinus(priceFormatFor(precision).format(value));
}

export function formatAxisScore(value: number): string {
  return withTrueMinus(scoreFormat.format(value));
}

export function formatAxisVolume(value: number): string {
  return volumeFormat.format(value);
}

// O formato de cada eixo para a biblioteca (`priceFormat` personalizado): o eixo fala pt-BR como o resto da tela.
export function pricePriceFormat(precision: number): PriceFormatOption {
  return {
    type: 'custom',
    formatter: (value: number): string => formatAxisPrice(value, precision),
    minMove: 10 ** -precision,
  };
}

export const SCORE_PRICE_FORMAT: PriceFormatOption = {
  type: 'custom',
  formatter: formatAxisScore,
  minMove: 0.01,
};

export const VOLUME_PRICE_FORMAT: PriceFormatOption = {
  type: 'custom',
  formatter: formatAxisVolume,
  minMove: 1,
};
