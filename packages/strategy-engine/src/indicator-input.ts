// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorCandle, IndicatorValue } from './indicator.types.js';
import { INDICATOR_ERROR_CODE, IndicatorError } from './strategy-engine.error.js';

const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;

export function refuseIndicator(
  code: (typeof INDICATOR_ERROR_CODE)[keyof typeof INDICATOR_ERROR_CODE],
  message: string,
): never {
  throw new IndicatorError({ code, message });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Todo campo precisa ser número finito; `openTime` inteiro seguro; volume nunca negativo.
export function assertIndicatorCandle(candle: IndicatorCandle): void {
  const fields: Readonly<Record<string, unknown>> = candle;
  const missing = PRICE_FIELDS.filter((field) => !isFiniteNumber(fields[field]));
  if (missing.length > 0) {
    refuseIndicator(
      INDICATOR_ERROR_CODE.INVALID_CANDLE,
      `Candle com campo ausente ou não finito: ${missing.join(', ')}.`,
    );
  }
  if (!Number.isSafeInteger(candle.openTime) || candle.openTime < 0) {
    refuseIndicator(INDICATOR_ERROR_CODE.INVALID_CANDLE, 'Candle com openTime inválido.');
  }
  if (candle.volume < 0) {
    refuseIndicator(INDICATOR_ERROR_CODE.INVALID_CANDLE, 'Candle com volume negativo.');
  }
}

export function assertIndicatorPeriod(period: number, name: string): void {
  if (!Number.isInteger(period) || period < 1) {
    refuseIndicator(
      INDICATOR_ERROR_CODE.INVALID_PARAMETER,
      `Período inválido em ${name}: precisa ser inteiro e ao menos 1.`,
    );
  }
}

// `-0` vira `0` para o valor e o snapshot serem canônicos; resultado não finito é erro, não `NaN`.
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function finishIndicatorValue<TValue extends IndicatorValue>(value: TValue): TValue {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      refuseIndicator(
        INDICATOR_ERROR_CODE.NON_FINITE_RESULT,
        'Indicador produziu valor não finito.',
      );
    }
    return normalizeZero(value) as TValue;
  }
  const entries = Object.entries(value).map(([output, member]) => {
    if (!Number.isFinite(member)) {
      refuseIndicator(INDICATOR_ERROR_CODE.NON_FINITE_RESULT, `Saída ${output} não finita.`);
    }
    return [output, normalizeZero(member)] as const;
  });
  return Object.fromEntries(entries) as TValue;
}
