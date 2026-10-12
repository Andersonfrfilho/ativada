// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { RequestValidationError } from '../http/request-validation.error.js';
import {
  CURSOR_FIELD,
  CURSOR_MAX_LENGTH,
  INVALID_CURSOR_REASON,
  MAX_PAGE_SIZE,
} from './pagination.constant.js';

const LIMIT_PATTERN = /^\d{1,4}$/;

export const limitSchema = z
  .string()
  .regex(LIMIT_PATTERN)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_PAGE_SIZE));

export const cursorTextSchema = z.string().min(1).max(CURSOR_MAX_LENGTH);

// Campos de paginação que toda listagem aceita; cada rota acrescenta os próprios com `.extend`.
export const PAGE_QUERY_SHAPE = {
  limit: limitSchema.optional(),
  cursor: cursorTextSchema.optional(),
} as const;

export function invalidCursorError(): RequestValidationError {
  return new RequestValidationError([{ field: CURSOR_FIELD, reason: INVALID_CURSOR_REASON }]);
}
