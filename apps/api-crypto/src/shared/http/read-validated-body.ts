// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import type { ErrorDetail } from '../errors/app.error.js';
import { RequestValidationError } from './request-validation.error.js';

const BODY_FIELD = '(body)';
const VALIDATION_REASON = {
  INVALID_JSON: 'invalid_json',
  UNKNOWN_FIELD: 'unknown_field',
} as const;

function toErrorDetail(issue: z.core.$ZodIssue): ErrorDetail {
  if (issue.code === 'unrecognized_keys') {
    return { field: BODY_FIELD, reason: VALIDATION_REASON.UNKNOWN_FIELD };
  }
  const field = issue.path.length > 0 ? issue.path.map(String).join('.') : BODY_FIELD;
  return { field, reason: issue.code === 'custom' ? issue.message : issue.code };
}

function collectDetails(error: z.ZodError): readonly ErrorDetail[] {
  const unique = new Map<string, ErrorDetail>();
  for (const issue of error.issues) {
    const detail = toErrorDetail(issue);
    unique.set(`${detail.field}:${detail.reason}`, detail);
  }
  return [...unique.values()];
}

export async function readValidatedBody<TOutput>(
  request: Request,
  schema: z.ZodType<TOutput>,
): Promise<TOutput> {
  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) {
    throw new RequestValidationError([
      { field: BODY_FIELD, reason: VALIDATION_REASON.INVALID_JSON },
    ]);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RequestValidationError(collectDetails(parsed.error));
  return parsed.data;
}
