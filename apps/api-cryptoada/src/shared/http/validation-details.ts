// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import type { ErrorDetail } from '../errors/app.error.js';

export const VALIDATION_REASON = {
  INVALID_JSON: 'invalid_json',
  UNKNOWN_FIELD: 'unknown_field',
} as const;

// Só o caminho e o motivo estável saem: o valor que o cliente mandou nunca volta na resposta (RNF04).
function toErrorDetail(issue: z.core.$ZodIssue, rootField: string): ErrorDetail {
  if (issue.code === 'unrecognized_keys') {
    return { field: rootField, reason: VALIDATION_REASON.UNKNOWN_FIELD };
  }
  const field = issue.path.length > 0 ? issue.path.map(String).join('.') : rootField;
  return { field, reason: issue.code === 'custom' ? issue.message : issue.code };
}

// Todos os problemas de uma vez, sem repetir o mesmo campo com o mesmo motivo.
export function collectValidationDetails(
  error: z.ZodError,
  rootField: string,
): readonly ErrorDetail[] {
  const unique = new Map<string, ErrorDetail>();
  for (const issue of error.issues) {
    const detail = toErrorDetail(issue, rootField);
    unique.set(`${detail.field}:${detail.reason}`, detail);
  }
  return [...unique.values()];
}
