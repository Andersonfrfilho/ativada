// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DECIMAL_PATTERN, PERCENT_DECIMAL_PLACES } from './ticker.constant.js';

const TEN = 10n;
const HUNDRED = 100n;
const TWO = 2n;
const FRACTION_SEPARATOR = '.';

type ScaledDecimal = { readonly digits: bigint; readonly places: number };

function scale(text: string): ScaledDecimal {
  const [integerPart = '', fractionPart = ''] = text.split(FRACTION_SEPARATOR);
  return { digits: BigInt(`${integerPart}${fractionPart}`), places: fractionPart.length };
}

function alignTo(value: ScaledDecimal, places: number): bigint {
  return value.digits * TEN ** BigInt(places - value.places);
}

// Metade se afasta do zero: 0,00005 % vira 0,0001 e -0,00005 % vira -0,0001.
function divideHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = (magnitude * TWO + denominator) / (denominator * TWO);
  return numerator < 0n ? -quotient : quotient;
}

function formatPercent(scaled: bigint): string {
  const magnitude = scaled < 0n ? -scaled : scaled;
  const factor = TEN ** BigInt(PERCENT_DECIMAL_PLACES);
  const integerPart = magnitude / factor;
  const fractionPart = (magnitude % factor).toString().padStart(PERCENT_DECIMAL_PLACES, '0');
  const sign = scaled < 0n ? '-' : '';
  return `${sign}${integerPart}${FRACTION_SEPARATOR}${fractionPart}`;
}

export type ChangePercentParams = { readonly open: string; readonly close: string };

// (fechamento − abertura) ÷ abertura × 100, em aritmética decimal exata, com 4 casas. `undefined` quando a abertura é
// zero ou o texto não é um decimal simples (o stream é entrada de terceiro).
export function computeChangePercent(params: ChangePercentParams): string | undefined {
  if (!DECIMAL_PATTERN.test(params.open) || !DECIMAL_PATTERN.test(params.close)) return undefined;
  const open = scale(params.open);
  const close = scale(params.close);
  const places = Math.max(open.places, close.places);
  const openDigits = alignTo(open, places);
  if (openDigits === 0n) return undefined;
  const difference = alignTo(close, places) - openDigits;
  const factor = TEN ** BigInt(PERCENT_DECIMAL_PLACES);
  const percent = divideHalfAwayFromZero(difference * HUNDRED * factor, openDigits);
  return formatPercent(percent);
}
