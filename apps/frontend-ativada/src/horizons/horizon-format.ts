// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DECIMAL_SCALE, formatDecimalText, formatScaled, parseScaled } from '../format/decimal.js';

const NOT_AVAILABLE = '—';
const PERCENT_FACTOR = 100n;
const ROUNDING_UNIT = 10n ** BigInt(DECIMAL_SCALE - 1);
const ONE_PLACE = { minimumFraction: 1, maximumFraction: 1 } as const;
const MONEY_PLACES = { minimumFraction: 2, maximumFraction: 2 } as const;

type Rounding = 'floor' | 'ceil';

// Contra o usuário, como a frase do servidor: ganho e fração de acertos para baixo, a fatia das taxas para cima.
function roundPercentScaled(percent: bigint, rounding: Rounding): bigint {
  const quotient = percent / ROUNDING_UNIT;
  const hasRemainder = percent % ROUNDING_UNIT !== 0n;
  if (hasRemainder && rounding === 'floor' && percent < 0n) return (quotient - 1n) * ROUNDING_UNIT;
  if (hasRemainder && rounding === 'ceil' && percent > 0n) return (quotient + 1n) * ROUNDING_UNIT;
  return quotient * ROUNDING_UNIT;
}

function toRoundedPercent(rate: string | null, rounding: Rounding): bigint | undefined {
  const scaled = rate === null ? undefined : parseScaled(rate);
  if (scaled === undefined) return undefined;
  return roundPercentScaled(scaled * PERCENT_FACTOR, rounding);
}

// Um ganho que fica em "0,0" não leva "+": a frase do servidor também o escreve sem sinal.
function formatRoundedRate(rate: string | null, hasSign: boolean, rounding: Rounding): string {
  const percent = toRoundedPercent(rate, rounding);
  if (percent === undefined) return NOT_AVAILABLE;
  const sign = hasSign && percent > 0n ? '+' : '';
  return `${sign}${formatScaled(percent, ONE_PLACE)}%`;
}

// "0.0046" vira "+0,4%": a conta é em BigInt sobre o texto da API, nunca em `Number`, e o corte é para baixo.
export function formatRate(rate: string | null, hasSign: boolean): string {
  return formatRoundedRate(rate, hasSign, 'floor');
}

export function formatFeeShare(rate: string | null): string {
  return formatRoundedRate(rate, false, 'ceil');
}

export function formatFees(fees: string): string {
  return `${formatDecimalText(fees, MONEY_PLACES)} USDT`;
}

export function rateTone(rate: string | null): 'positive' | 'negative' | undefined {
  const percent = toRoundedPercent(rate, 'floor');
  if (percent === undefined || percent === 0n) return undefined;
  return percent > 0n ? 'positive' : 'negative';
}
