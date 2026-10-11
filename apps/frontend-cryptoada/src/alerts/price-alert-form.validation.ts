// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FormProblem } from '../forms/ProblemList.component.js';

export type PriceAlertFormValues = {
  readonly symbol: string;
  readonly direction: 'above' | 'below';
  readonly value: string;
};

const VALUE_PATTERN = /^\d{1,10}(\.\d{1,8})?$/;

export { normalizeDecimalInput as normalizeDecimalText } from '../forms/decimal-input.js';
import { normalizeDecimalInput } from '../forms/decimal-input.js';

export function validatePriceAlertForm(values: PriceAlertFormValues): FormProblem[] {
  const value = normalizeDecimalInput(values.value);
  const isValid = VALUE_PATTERN.test(value) && Number(value) > 0;
  return isValid
    ? []
    : [{ field: 'Valor do alerta', message: 'informe um preço maior que zero (ex.: 70000).' }];
}
