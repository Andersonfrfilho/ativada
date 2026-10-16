// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatDecimalText,
  formatScaled,
  parseScaled,
  roundScaledDirected,
} from '../format/decimal.js';

export type SymbolFilters = { readonly tickSize: string; readonly quantityStep: string };

// Espelho de packages/market-data-crypto/src/symbol-filters.constant.ts (o painel não importa outro pacote do
// monorepo; test/panel-symbol-filters.contract.test.ts prende a igualdade). BTC e ETH ficam fora: seguem o padrão.
export const SYMBOL_FILTERS: Readonly<Record<string, SymbolFilters>> = {
  DOGEUSDT: { tickSize: '0.00001', quantityStep: '1' },
  PEPEUSDT: { tickSize: '0.00000001', quantityStep: '1' },
  SHIBUSDT: { tickSize: '0.00000001', quantityStep: '1' },
  SOLUSDT: { tickSize: '0.01', quantityStep: '0.001' },
  XRPUSDT: { tickSize: '0.0001', quantityStep: '0.1' },
  BNBUSDT: { tickSize: '0.01', quantityStep: '0.001' },
  LINKUSDT: { tickSize: '0.001', quantityStep: '0.01' },
};

const DEFAULT_PRICE_PLACES = 2;
const MAXIMUM_PLACES = 8;

export function findSymbolFilters(symbol: string): SymbolFilters | undefined {
  return Object.hasOwn(SYMBOL_FILTERS, symbol) ? SYMBOL_FILTERS[symbol] : undefined;
}

// Casas decimais do tick do par (LINK/USDT: 3); BTC e ETH usam o padrão de 2.
export function priceDecimals(symbol: string): number {
  const tick = findSymbolFilters(symbol)?.tickSize;
  return Math.min(tick?.split('.')[1]?.length ?? DEFAULT_PRICE_PLACES, MAXIMUM_PLACES);
}

// O preço como se digita na corretora: casas do tick, para cima quando sobra casa (nunca a favor da simulação), em pt-BR.
export function formatPriceAtTick(symbol: string, text: string): string {
  const scaled = parseScaled(text);
  if (scaled === undefined) return '—';
  const places = priceDecimals(symbol);
  const rounded = roundScaledDirected(scaled, places, 'up');
  return formatScaled(rounded, { minimumFraction: places, maximumFraction: places });
}

export function formatQuantity(symbol: string, text: string): string {
  const places = findSymbolFilters(symbol)?.quantityStep.split('.')[1]?.length ?? 0;
  return formatDecimalText(text, { minimumFraction: places, maximumFraction: places });
}
