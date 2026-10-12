// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SymbolFiltersNotFoundError } from './market-data.error.js';

export type SymbolFilters = {
  readonly tickSize: string;
  readonly quantityStep: string;
};

// BTC e ETH usam os padrões do motor (o runHash das execuções antigas não pode mudar), por isso ficam fora da tabela.
export const ENGINE_DEFAULT_FILTER_SYMBOLS: readonly string[] = ['BTCUSDT', 'ETHUSDT'];

export const BINANCE_SYMBOL_FILTERS: Readonly<Record<string, SymbolFilters>> = {
  DOGEUSDT: { tickSize: '0.00001', quantityStep: '1' },
  PEPEUSDT: { tickSize: '0.00000001', quantityStep: '1' },
  SHIBUSDT: { tickSize: '0.00000001', quantityStep: '1' },
  SOLUSDT: { tickSize: '0.01', quantityStep: '0.001' },
  XRPUSDT: { tickSize: '0.0001', quantityStep: '0.1' },
  BNBUSDT: { tickSize: '0.01', quantityStep: '0.001' },
  LINKUSDT: { tickSize: '0.001', quantityStep: '0.01' },
};

export function hasKnownSymbolFilters(symbol: string): boolean {
  return ENGINE_DEFAULT_FILTER_SYMBOLS.includes(symbol) || symbol in BINANCE_SYMBOL_FILTERS;
}

export function resolveSymbolFilters(symbol: string): SymbolFilters | undefined {
  if (ENGINE_DEFAULT_FILTER_SYMBOLS.includes(symbol)) return undefined;
  const filters = Object.hasOwn(BINANCE_SYMBOL_FILTERS, symbol)
    ? BINANCE_SYMBOL_FILTERS[symbol]
    : undefined;
  if (filters === undefined) throw new SymbolFiltersNotFoundError(symbol);
  return filters;
}
