// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import { RequestValidationError } from './request-validation.error.js';
import { collectValidationDetails } from './validation-details.js';

const QUERY_FIELD = '(query)';

// Parâmetro repetido (`?a=1&a=2`) vira lista e o esquema o recusa: nunca "o último vence" em silêncio.
function readQueryRecord(request: Request): Record<string, string | readonly string[]> {
  const record: Record<string, string | readonly string[]> = {};
  for (const [name, value] of new URL(request.url).searchParams) {
    const previous = record[name];
    if (previous === undefined) record[name] = value;
    else record[name] = [...(typeof previous === 'string' ? [previous] : previous), value];
  }
  return record;
}

export function readValidatedQuery<TOutput>(request: Request, schema: z.ZodType<TOutput>): TOutput {
  const parsed = schema.safeParse(readQueryRecord(request));
  if (!parsed.success) {
    throw new RequestValidationError(collectValidationDetails(parsed.error, QUERY_FIELD));
  }
  return parsed.data;
}
