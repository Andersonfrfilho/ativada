// Copyright (c) 2026 Ada Technology. All rights reserved.
import { hasKnownSymbolFilters, resolveSymbolFilters } from '@ativada/market-data-crypto';
import { EngineDecimal, toEngineDecimal } from '@ativada/strategy-engine';

import { formatPrice } from '../runs/live-status/live-number-format.js';

const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;

function countDecimals(tickSize: string): number {
  return tickSize.split('.')[1]?.length ?? 0;
}

// O preço como a pessoa o digita na corretora: casas do tick do par (LINK/USDT: 3), para cima quando sobra casa
// (alvo e proteção nunca ficam a favor da simulação) e em pt-BR. Par fora da tabela (BTC e ETH) segue o padrão.
export function formatNoticePrice(symbol: string, text: string): string {
  if (!hasKnownSymbolFilters(symbol)) return formatPrice(text);
  const filters = resolveSymbolFilters(symbol);
  if (filters === undefined) return formatPrice(text);
  const places = countDecimals(filters.tickSize);
  const fixed = toEngineDecimal(text)
    .toDecimalPlaces(places, EngineDecimal.ROUND_CEIL)
    .toFixed(places);
  const [integer = '0', fraction] = fixed.split('.');
  const grouped = integer.replace(THOUSANDS_PATTERN, '.');
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}
