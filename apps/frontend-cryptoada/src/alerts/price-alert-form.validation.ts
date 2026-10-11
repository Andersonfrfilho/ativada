// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FormProblem } from '../forms/ProblemList.component.js';

export type PriceAlertFormValues = {
  readonly symbol: string;
  readonly direction: 'above' | 'below';
  readonly value: string;
};

const VALUE_PATTERN = /^\d{1,10}(\.\d{1,8})?$/;

// Aceita a vírgula do teclado brasileiro; o texto que vai à API tem ponto.
export function normalizeDecimalText(text: string): string {
  return text.trim().replace(',', '.');
}

export function validatePriceAlertForm(values: PriceAlertFormValues): FormProblem[] {
  const value = normalizeDecimalText(values.value);
  const isValid = VALUE_PATTERN.test(value) && Number(value) > 0;
  return isValid
    ? []
    : [{ field: 'Valor do alerta', message: 'informe um preço maior que zero (ex.: 70000).' }];
}
