// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { formatEngineDecimal, toEngineDecimal } from './engine-decimal.js';

// Valor não inteiro que entra em conta de dinheiro ou de pontuação cruza a borda como texto decimal.
const DECIMAL_TEXT_PATTERN = /^-?\d{1,18}(\.\d{1,12})?$/;

export type DecimalBounds = {
  readonly minimum: string;
  readonly maximum: string;
  readonly isMinimumExclusive?: boolean;
  readonly isMaximumExclusive?: boolean;
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
  return isAboveMinimum && isBelowMaximum;
}

function describeBounds(bounds: DecimalBounds): string {
  const opening = bounds.isMinimumExclusive === true ? '(' : '[';
  const closing = bounds.isMaximumExclusive === true ? ')' : ']';
  return `${opening}${bounds.minimum}, ${bounds.maximum}${closing}`;
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

export const DECIMAL_STATE_TEXT_SCHEMA = z.string().regex(/^-?\d+(\.\d+)?$/);
