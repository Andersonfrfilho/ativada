// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, isPlainDecimal } from './decimal.js';

const LOCALE = 'pt-BR';
const QUOTE_ASSET = 'USDT';
const FRACTION_DIGITS = 2;

const numberFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: FRACTION_DIGITS,
  maximumFractionDigits: FRACTION_DIGITS,
});
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Só para exibição: o cálculo e a persistência seguem em texto decimal na API.
export function formatDecimal(decimalText: string): string {
  if (!isPlainDecimal(decimalText)) return numberFormat.format(Number(decimalText));
  return formatDecimalText(decimalText, {
    minimumFraction: FRACTION_DIGITS,
    maximumFraction: FRACTION_DIGITS,
  });
}

const PRICE_MAXIMUM_FRACTION = 8;

// Preço, nível e valor de alerta aceitam até 8 casas: mostra todas as que existem (mínimo 2), sem cortar moeda barata.
export function formatPrice(decimalText: string): string {
  if (!isPlainDecimal(decimalText)) return numberFormat.format(Number(decimalText));
  return formatDecimalText(decimalText, {
    minimumFraction: FRACTION_DIGITS,
    maximumFraction: PRICE_MAXIMUM_FRACTION,
  });
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

// Fração (0,0425) como porcentagem simples, sem sinal: "4,25%".
export function formatPercent(ratio: number): string {
  return `${numberFormat.format(ratio * 100)}%`;
}

export function formatDate(epochMilliseconds: number): string {
  return dateFormat.format(new Date(epochMilliseconds));
}

// Quantidade de moeda: até 8 casas, sem zeros à direita ("0,5", não "0,50").
export function formatQuantity(decimalText: string): string {
  if (!isPlainDecimal(decimalText)) return numberFormat.format(Number(decimalText));
  return formatDecimalText(decimalText, {
    minimumFraction: 0,
    maximumFraction: PRICE_MAXIMUM_FRACTION,
  });
}
