// Copyright (c) 2026 Ada Technology. All rights reserved.

// Oráculo independente do `decimal.js`: inteiros `bigint` com escala fixa, divisão com direção explícita.
export function toScaled(text: string, scale: number): bigint {
  const negative = text.startsWith('-');
  const [integer = '0', fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > scale) throw new Error(`escala insuficiente para ${text}`);
  const value = BigInt(integer + fraction.padEnd(scale, '0'));
  return negative ? -value : value;
}

export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, '');
  const text = fraction === '' ? integer : `${integer}.${fraction}`;
  return negative && text !== '0' ? `-${text}` : text;
}

export function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const hasRemainder = numerator % denominator !== 0n;
  const isNegative = numerator < 0n !== denominator < 0n;
  return hasRemainder && isNegative ? quotient - 1n : quotient;
}

export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return -floorDivide(-numerator, denominator);
}
