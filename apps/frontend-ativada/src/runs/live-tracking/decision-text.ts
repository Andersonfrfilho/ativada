// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatDecimalText,
  formatScaled,
  formatSignedScaled,
  parseScaled,
  roundScaledDirected,
} from '../../format/decimal.js';
import { formatRelativeMoment, type MomentContext } from '../../format/zoned-moment.js';
import { formatDirectedMoney, type RoundingDirection } from '../directed-money.js';

const MISSING_TEXT = '—';
const MINUS_SIGN = '−';
const ZERO_SCORE = '0';
const CENTS = 2;
const QUOTE_CURRENCY = 'USDT';
const SCORE_FORMAT = { minimumFraction: 0, maximumFraction: 2 } as const;
// A API manda taxas com até 12 casas; um centésimo de ponto percentual é 10^8 dessa escala.
const RATE_SCALE_DIGITS = 12;
const HUNDREDTH_OF_PERCENT = 10n ** 8n;
const HUNDREDTH_TO_SCALED_PERCENT = 10n ** 6n;
const ZERO = 0n;
const RATE_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

export type ResultTrend = 'gain' | 'loss' | 'flat';

export type LiveResultText = { readonly text: string; readonly trend: ResultTrend };

// "10:00 de hoje", "23:00 de ontem" ou a data completa, no fuso do usuário: o instante é o FECHAMENTO da vela, em ms UTC.
export function formatClosingMoment(closedAt: number, context: MomentContext): string {
  return formatRelativeMoment(closedAt, context);
}

function formatSignedScore(text: string): string {
  const formatted = formatDecimalText(text, SCORE_FORMAT);
  if (formatted === ZERO_SCORE) return formatted;
  return formatted.startsWith('-') ? `${MINUS_SIGN}${formatted.slice(1)}` : `+${formatted}`;
}

// "+1 de +2" e "−2,5 de +2": a pontuação da vela contra o limiar que ela precisava alcançar (sinal explícito, vírgula pt-BR, até 2 casas).
export function formatScoreOfThreshold(score: string, threshold: string): string {
  return `${formatSignedScore(score)} de ${formatSignedScore(threshold)}`;
}

// '12.345,67 USDT': saldo, resultado e "ainda cabe" descem; perda e "falta" sobem (a direção é a do campo no servidor).
export function formatUsdt(amount: string, direction: RoundingDirection): string {
  return `${formatDirectedMoney(amount, direction)} ${QUOTE_CURRENCY}`;
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator !== ZERO && numerator < ZERO ? quotient - 1n : quotient;
}

function parseRate(text: string): bigint | undefined {
  const match = RATE_PATTERN.exec(text);
  if (match === null) return undefined;
  const [, sign = '', whole = '', fraction = ''] = match;
  const digits = BigInt(
    `${whole}${fraction.slice(0, RATE_SCALE_DIGITS).padEnd(RATE_SCALE_DIGITS, '0')}`,
  );
  return sign === '-' ? -digits : digits;
}

// A taxa (fração) como porcentagem de 2 casas, arredondada na direção que o servidor usa: perda e "falta" para cima, ganho para baixo.
export function formatDirectedPercent(rate: string, direction: RoundingDirection): string {
  const scaledRate = parseRate(rate);
  if (scaledRate === undefined) return MISSING_TEXT;
  const hundredths =
    direction === 'down'
      ? floorDivide(scaledRate, HUNDREDTH_OF_PERCENT)
      : -floorDivide(-scaledRate, HUNDREDTH_OF_PERCENT);
  const sign = hundredths > ZERO ? '+' : '';
  return `${sign}${formatScaled(hundredths * HUNDREDTH_TO_SCALED_PERCENT)}%`;
}

// O resultado desce sempre (ganho menor, perda maior). Zero exato aparece como "= 0,00", sem sinal de ganho nem de perda.
export function describeLiveResult(result: string, rate: string): LiveResultText {
  const amount = parseScaled(result);
  if (amount === undefined) return { text: MISSING_TEXT, trend: 'flat' };
  const rounded = roundScaledDirected(amount, CENTS, 'down');
  const percent = formatDirectedPercent(rate, 'down');
  if (rounded === ZERO) return { text: `= ${formatScaled(rounded)} (${percent})`, trend: 'flat' };
  return {
    text: `${formatSignedScaled(rounded)} (${percent})`,
    trend: rounded > ZERO ? 'gain' : 'loss',
  };
}
