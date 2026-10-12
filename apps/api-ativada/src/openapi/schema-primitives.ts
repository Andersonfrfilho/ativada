// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

// Formas que a API devolve em várias rotas; os esquemas de resposta as reutilizam.
export const DECIMAL_TEXT_PATTERN = /^-?\d+(\.\d+)?$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const decimalTextSchema = z.string().regex(DECIMAL_TEXT_PATTERN);
export const resourceIdSchema = z.string().regex(UUID_PATTERN);
export const epochMillisecondsSchema = z.number().int().nonnegative();
export const isoDateTimeSchema = z.iso.datetime();

export const paginationSchema = z.strictObject({
  nextCursor: z.string().nullable(),
  perPage: z.number().int().positive(),
});

export function pathIdSchema(name: string): z.ZodType {
  return z.strictObject({ [name]: resourceIdSchema });
}
