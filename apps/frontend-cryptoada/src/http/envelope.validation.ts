// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), reason: z.string() })).optional(),
  }),
});

export const paginationSchema = z.object({
  nextCursor: z.string().nullable(),
  perPage: z.number(),
});

export function dataEnvelopeSchema<TData>(data: z.ZodType<TData>): z.ZodType<{ data: TData }> {
  return z.object({ data });
}

export function pageEnvelopeSchema<TItem>(
  item: z.ZodType<TItem>,
): z.ZodType<{ data: TItem[]; pagination: z.infer<typeof paginationSchema> }> {
  return z.object({ data: z.array(item), pagination: paginationSchema });
}
