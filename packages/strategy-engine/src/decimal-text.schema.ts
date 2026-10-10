// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { formatEngineDecimal, toEngineDecimal } from './engine-decimal.js';

// Valor não inteiro que entra em conta de dinheiro ou de pontuação cruza a borda como texto decimal.
const DECIMAL_TEXT_PATTERN = /^-?\d{1,18}(\.\d{1,12})?$/;

export type DecimalBounds = {
  readonly minimum: string;
  readonly maximum: string;
  readonly isMinimumExclusive?: boolean;
  readonly isMaximumExclusive?: boolean;
  readonly maximumDecimalPlaces?: number;
};

function isWithinBounds(text: string, bounds: DecimalBounds): boolean {
  if (!DECIMAL_TEXT_PATTERN.test(text)) return true;
  const value = toEngineDecimal(text);
  const minimum = toEngineDecimal(bounds.minimum);
  const maximum = toEngineDecimal(bounds.maximum);
  const isAboveMinimum =
    bounds.isMinimumExclusive === true ? value.greaterThan(minimum) : value.gte(minimum);
  const isBelowMaximum =
    bounds.isMaximumExclusive === true ? value.lessThan(maximum) : value.lte(maximum);
  const hasAllowedPlaces =
    value.decimalPlaces() <= (bounds.maximumDecimalPlaces ?? Number.POSITIVE_INFINITY);
  return isAboveMinimum && isBelowMaximum && hasAllowedPlaces;
}

function describeBounds(bounds: DecimalBounds): string {
  const opening = bounds.isMinimumExclusive === true ? '(' : '[';
  const closing = bounds.isMaximumExclusive === true ? ')' : ']';
  const places =
    bounds.maximumDecimalPlaces === undefined ? '' : `, até ${bounds.maximumDecimalPlaces} casa(s)`;
  return `${opening}${bounds.minimum}, ${bounds.maximum}${closing}${places}`;
}

// A saída é canônica ("0.0010" vira "0.001"): grafias equivalentes dão o mesmo hash de versão.
export function decimalTextSchema(
  bounds: DecimalBounds,
): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  return z
    .string()
    .regex(DECIMAL_TEXT_PATTERN, 'Use texto decimal, como "0.001" (sem expoente nem vírgula).')
    .refine((text) => isWithinBounds(text, bounds), `Fora do intervalo ${describeBounds(bounds)}.`)
    .transform((text) => formatEngineDecimal(toEngineDecimal(text)));
}

// Estado e decisões só carregam a grafia canônica: "00.10", "1.0" e "-0" são recusados.
const CANONICAL_DECIMAL_PATTERN = /^-?(0|[1-9]\d*)(\.\d*[1-9])?$/;
const NEGATIVE_ZERO = '-0';

const DECIMAL_STATE_TEXT_SCHEMA = z
  .string()
  .regex(CANONICAL_DECIMAL_PATTERN, 'Decimal fora da grafia canônica.')
  .refine((text) => text !== NEGATIVE_ZERO, 'Zero negativo não é canônico.');
export const NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA = DECIMAL_STATE_TEXT_SCHEMA.refine(
  (text) => !text.startsWith('-'),
  'Valor negativo.',
);
export const POSITIVE_DECIMAL_STATE_TEXT_SCHEMA = NON_NEGATIVE_DECIMAL_STATE_TEXT_SCHEMA.refine(
  (text) => text !== '0',
  'Valor precisa ser positivo.',
);
