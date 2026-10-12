// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '../../packages/environment/src/index.js';

export const runCountsSchema = z.strictObject({
  signals: z.number().int(),
  orders: z.number().int(),
  fills: z.number().int(),
  positions: z.number().int(),
  equityPoints: z.number().int(),
  alerts: z.number().int(),
  lastCandleTime: z.number().int().nullable(),
});

export type RunCounts = z.infer<typeof runCountsSchema>;

export const COUNT_FIELDS = [
  'signals',
  'orders',
  'fills',
  'positions',
  'equityPoints',
  'alerts',
] as const;

// Depois do reinício nada pode ter encolhido: contagem menor que a de antes é linha perdida.
export function findShrunkCounts(before: RunCounts, after: RunCounts): readonly string[] {
  return COUNT_FIELDS.filter((field) => after[field] < before[field]);
}
