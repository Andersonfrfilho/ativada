// Copyright (c) 2026 Ada Technology. All rights reserved.

// Oráculo de contabilidade INDEPENDENTE: só `bigint`, sem importar nada do pacote nem da referência.
// Valores monetários, preços, quantidades e taxas valem em unidades de 1e-8 (SCALE); o notional
// (preço × quantidade) vale em 1e-16.
export const SCALE = 10n ** 8n;
export const MAXIMUM_DECIMAL_PLACES = 8;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

// Texto decimal -> unidades de 1e-8. Mais de 8 casas é recusado: o dinheiro é numeric(24,8).
export function parseScaled(text: string): bigint {
  const parts = DECIMAL_PATTERN.exec(text);
  const fraction = parts?.[3] ?? '';
  if (parts === null || fraction.length > MAXIMUM_DECIMAL_PLACES) {
    throw new Error(`Decimal inválido ou com mais de 8 casas: ${text}`);
  }
  const units =
    BigInt(parts[2] ?? '0') * SCALE + BigInt(fraction.padEnd(MAXIMUM_DECIMAL_PLACES, '0'));
  return parts[1] === '-' ? -units : units;
}

// Unidades de 10^-places -> texto canônico (sem zeros à direita, "0" para zero).
export function formatFixed(units: bigint, places: number): string {
  const sign = units < 0n ? '-' : '';
  const digits = (units < 0n ? -units : units).toString().padStart(places + 1, '0');
  const integer = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places).replace(/0+$/, '');
  return fraction === ''
    ? units === 0n
      ? '0'
      : `${sign}${integer}`
    : `${sign}${integer}.${fraction}`;
}

export function formatScaled(units: bigint): string {
  return formatFixed(units, MAXIMUM_DECIMAL_PLACES);
}

// Divisão inteira para o divisor positivo: piso (rumo a −∞) e teto (rumo a +∞), também para negativos.
export function floorDiv(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  return dividend % divisor !== 0n && dividend < 0n ? quotient - 1n : quotient;
}

export function ceilDiv(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  return dividend % divisor !== 0n && dividend > 0n ? quotient + 1n : quotient;
}

export function floorToIncrement(value: bigint, increment: bigint): bigint {
  return floorDiv(value, increment) * increment;
}

export function ceilToIncrement(value: bigint, increment: bigint): bigint {
  return ceilDiv(value, increment) * increment;
}

// Dinheiro (1e-8) a partir do notional (1e-16): débito sobe, crédito desce.
export function moneyUp(notional: bigint): bigint {
  return ceilDiv(notional, SCALE);
}

export function moneyDown(notional: bigint): bigint {
  return floorDiv(notional, SCALE);
}

// ceil8(notional × taxa): notional em 1e-16 e taxa em 1e-8 dão 1e-24; a taxa é cobrada em 1e-8.
export function tradeFee(notional: bigint, feeRate: bigint): bigint {
  return ceilDiv(notional * feeRate, SCALE * SCALE);
}

export function buyDebit(notional: bigint, feeRate: bigint): bigint {
  return moneyUp(notional) + tradeFee(notional, feeRate);
}

export function sellCredit(notional: bigint, feeRate: bigint): bigint {
  return moneyDown(notional) - tradeFee(notional, feeRate);
}
