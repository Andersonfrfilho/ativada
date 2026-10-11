// Copyright (c) 2026 Ada Technology. All rights reserved.
const LOCALE = 'pt-BR';
const QUOTE_ASSET = 'USDT';
const FRACTION_DIGITS = 2;

const numberFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: FRACTION_DIGITS,
  maximumFractionDigits: FRACTION_DIGITS,
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Só para exibição: o cálculo e a persistência seguem em texto decimal na API.
export function formatDecimal(decimalText: string): string {
  return numberFormat.format(Number(decimalText));
}

export function formatChangePercent(ratio: number): string {
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${numberFormat.format(ratio * 100)}%`;
}

export function computeChangeRatio(current: string, reference: string): number | undefined {
  const referenceValue = Number(reference);
  if (!Number.isFinite(referenceValue) || referenceValue === 0) return undefined;
  return Number(current) / referenceValue - 1;
}

export function formatSymbol(symbol: string): string {
  return symbol.endsWith(QUOTE_ASSET)
    ? `${symbol.slice(0, -QUOTE_ASSET.length)}/${QUOTE_ASSET}`
    : symbol;
}

export function formatDateTime(epochMilliseconds: number): string {
  return dateTimeFormat.format(new Date(epochMilliseconds));
}
