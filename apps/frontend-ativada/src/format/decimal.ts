// Copyright (c) 2026 Ada Technology. All rights reserved.

// Dinheiro e quantidade no navegador são inteiros BigInt com escala fixa de 8 casas (a mesma do motor): nunca ponto flutuante.
export const DECIMAL_SCALE = 8;
const SCALE_FACTOR = 10n ** BigInt(DECIMAL_SCALE);
const PLAIN_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const GROUP_SIZE = 3;
const ZERO = 0n;

export function isPlainDecimal(text: string): boolean {
  return PLAIN_DECIMAL.test(text);
}

export type FormatOptions = { readonly minimumFraction: number; readonly maximumFraction: number };

// Casas além da oitava são descartadas (para zero); o texto da API nunca passa de 8.
export function parseScaled(text: string): bigint | undefined {
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return undefined;
  const [, sign = '', whole = '', fraction = ''] = match;
  const digits = BigInt(`${whole}${fraction.slice(0, DECIMAL_SCALE).padEnd(DECIMAL_SCALE, '0')}`);
  return sign === '-' ? -digits : digits;
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const hasRemainder = numerator % denominator !== ZERO;
  const isNegative = numerator < ZERO !== denominator < ZERO;
  return hasRemainder && isNegative ? quotient - 1n : quotient;
}

// Produto de dois valores escalados, de volta à escala: o valor de mercado arredonda para BAIXO...
export function multiplyDown(left: bigint, right: bigint): bigint {
  return floorDivide(left * right, SCALE_FACTOR);
}

// ...e o custo para CIMA (contra o usuário nas duas pontas, como a API).
export function multiplyUp(left: bigint, right: bigint): bigint {
  return -floorDivide(-(left * right), SCALE_FACTOR);
}

// Quociente na escala, para o lado de menos (a taxa de resultado nunca parece melhor do que é).
export function divideFloor(numerator: bigint, denominator: bigint): bigint | undefined {
  if (denominator === ZERO) return undefined;
  return floorDivide(numerator * SCALE_FACTOR, denominator);
}

export function toPlainText(value: bigint): string {
  const sign = value < ZERO ? '-' : '';
  const digits = (value < ZERO ? -value : value).toString().padStart(DECIMAL_SCALE + 1, '0');
  const whole = digits.slice(0, digits.length - DECIMAL_SCALE);
  return `${sign}${whole}.${digits.slice(digits.length - DECIMAL_SCALE)}`;
}

// Arredonda (meio para cima, afastando de zero) para `places` casas, mantendo a escala de 8.
export function roundScaledHalfUp(value: bigint, places: number): bigint {
  const unit = 10n ** BigInt(DECIMAL_SCALE - places);
  const magnitude = value < ZERO ? -value : value;
  const rounded = ((magnitude + unit / 2n) / unit) * unit;
  return value < ZERO ? -rounded : rounded;
}

function groupThousands(whole: string): string {
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= GROUP_SIZE) {
    groups.unshift(whole.slice(Math.max(0, end - GROUP_SIZE), end));
  }
  return groups.join('.');
}

// Formatação pt-BR a partir do TEXTO decimal, sem passar por `number` (que perde dígitos acima de 2^53).
export function formatDecimalText(text: string, options: FormatOptions): string {
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return '—';
  const [, sign = '', whole = '', fraction = ''] = match;
  const kept = fraction.slice(0, options.maximumFraction).padEnd(options.maximumFraction, '0');
  const shouldRoundUp = (fraction[options.maximumFraction] ?? '0') >= '5';
  const total = BigInt(`${whole}${kept}`) + (shouldRoundUp ? 1n : ZERO);
  const digits = total.toString().padStart(options.maximumFraction + 1, '0');
  const integerPart = digits.slice(0, digits.length - options.maximumFraction);
  let decimals = digits.slice(digits.length - options.maximumFraction);
  while (decimals.length > options.minimumFraction && decimals.endsWith('0')) {
    decimals = decimals.slice(0, -1);
  }
  const isZero = total === ZERO;
  const prefix = sign === '-' && !isZero ? '-' : '';
  const body = groupThousands(integerPart);
  return decimals === '' ? `${prefix}${body}` : `${prefix}${body},${decimals}`;
}

const TWO_PLACES: FormatOptions = { minimumFraction: 2, maximumFraction: 2 };
const PERCENT_FACTOR = 100n;

export function formatScaled(value: bigint, options: FormatOptions = TWO_PLACES): string {
  return formatDecimalText(toPlainText(value), options);
}

// "+1.000,00" para o que ganhou; a perda já vem com o sinal de menos.
export function formatSignedScaled(value: bigint): string {
  return `${value > ZERO ? '+' : ''}${formatScaled(value)}`;
}

// Uma fração escalada (0,0333) como porcentagem com sinal explícito: "+3,33%".
export function formatSignedScaledPercent(rate: bigint): string {
  return `${rate > ZERO ? '+' : ''}${formatScaled(rate * PERCENT_FACTOR)}%`;
}
