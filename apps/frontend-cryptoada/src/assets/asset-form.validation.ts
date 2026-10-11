// Copyright (c) 2026 Ada Technology. All rights reserved.
import { normalizeDecimalText } from '../alerts/price-alert-form.validation.js';
import type { FormProblem } from '../forms/ProblemList.component.js';
import { ApiError } from '../http/api.error.js';
import {
  ASSET_ERROR_TEXT,
  ASSET_FIELD_LABEL,
  ASSET_OPERATION,
  type AssetOperation,
} from './asset.constant.js';

export type AssetFormValues = {
  readonly operation: AssetOperation;
  readonly symbol: string;
  readonly quantity: string;
  readonly price: string;
};

const DECIMAL_PATTERN = /^\d{1,14}(\.\d{1,8})?$/;

function positiveDecimal(field: string, text: string): FormProblem | undefined {
  const value = normalizeDecimalText(text);
  const isValid = DECIMAL_PATTERN.test(value) && Number(value) > 0;
  return isValid ? undefined : { field, message: 'informe um número maior que zero (ex.: 0.25).' };
}

export function priceLabel(operation: AssetOperation): string | undefined {
  if (operation === ASSET_OPERATION.BUY) return 'Preço pago';
  return operation === ASSET_OPERATION.REPLACE ? 'Preço médio' : undefined;
}

export function validateAssetForm(values: AssetFormValues): FormProblem[] {
  const label = priceLabel(values.operation);
  const problems = [
    positiveDecimal('Quantidade', values.quantity),
    label === undefined ? undefined : positiveDecimal(label, values.price),
  ];
  return problems.filter((problem): problem is FormProblem => problem !== undefined);
}

export function normalizeAssetForm(values: AssetFormValues): AssetFormValues {
  return {
    ...values,
    quantity: normalizeDecimalText(values.quantity),
    price: normalizeDecimalText(values.price),
  };
}

export function messageFromAssetError(error: Error | null): string | undefined {
  if (error === null) return undefined;
  if (!(error instanceof ApiError)) return 'Não foi possível concluir. Tente novamente.';
  const known = ASSET_ERROR_TEXT[error.code];
  if (known !== undefined) return known;
  const fields = error.details.map((detail) => ASSET_FIELD_LABEL[detail.field] ?? detail.field);
  return fields.length === 0 ? error.message : `Confira os campos: ${fields.join(', ')}.`;
}
