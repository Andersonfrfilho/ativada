// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

export const priceAlertSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: z.enum(['above', 'below']),
  value: z.string(),
  origin: z.enum(['manual', 'plan']),
  isEnabled: z.boolean(),
  triggeredAt: z.string().nullable(),
  createdAt: z.string(),
});

export const clearedSchema = z.object({ deleted: z.number().int().nonnegative() });

export type PriceAlert = z.infer<typeof priceAlertSchema>;
