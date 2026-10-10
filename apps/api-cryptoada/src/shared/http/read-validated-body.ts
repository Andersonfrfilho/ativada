// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import { RequestValidationError } from './request-validation.error.js';
import { collectValidationDetails, VALIDATION_REASON } from './validation-details.js';

const BODY_FIELD = '(body)';

export function parseWithSchema<TOutput>(input: unknown, schema: z.ZodType<TOutput>): TOutput {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new RequestValidationError(collectValidationDetails(parsed.error, BODY_FIELD));
  }
  return parsed.data;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) {
    throw new RequestValidationError([
      { field: BODY_FIELD, reason: VALIDATION_REASON.INVALID_JSON },
    ]);
  }
  return body;
}

export async function readValidatedBody<TOutput>(
  request: Request,
  schema: z.ZodType<TOutput>,
): Promise<TOutput> {
  return parseWithSchema(await readJsonBody(request), schema);
}
