// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, formatScaled, parseScaled } from '../format/decimal.js';

const NOT_AVAILABLE = '—';
const PERCENT_FACTOR = 100n;
const ONE_PLACE = { minimumFraction: 1, maximumFraction: 1 } as const;
const MONEY_PLACES = { minimumFraction: 2, maximumFraction: 2 } as const;

// "0.0041" vira "+0,4%": a conta é em BigInt sobre o texto da API, nunca em `Number`.
export function formatRate(rate: string | null, hasSign: boolean): string {
  const scaled = rate === null ? undefined : parseScaled(rate);
  if (scaled === undefined) return NOT_AVAILABLE;
  const sign = hasSign && scaled > 0n ? '+' : '';
  return `${sign}${formatScaled(scaled * PERCENT_FACTOR, ONE_PLACE)}%`;
}

export function formatFees(fees: string): string {
  return `${formatDecimalText(fees, MONEY_PLACES)} USDT`;
}

export function rateTone(rate: string | null): 'positive' | 'negative' | undefined {
  const scaled = rate === null ? undefined : parseScaled(rate);
  if (scaled === undefined || scaled === 0n) return undefined;
  return scaled > 0n ? 'positive' : 'negative';
}
