// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const planLevelSchema = z.object({
  status: z.enum(['price', 'already_active', 'unreachable']),
  price: z.string().nullable(),
  trigger: z.enum(['at_or_above', 'at_or_below']).nullable(),
  direction: z.enum(['above', 'below']).nullable(),
  distance: z.string().nullable(),
  distanceRate: z.string().nullable(),
});

const protectiveLevelSchema = z.object({ rate: z.string(), price: z.string() });

export const planViewSchema = z.object({
  strategy: z.object({ id: z.string(), name: z.string(), version: z.number() }),
  symbol: z.string(),
  plan: z.object({
    lastClose: z.string(),
    basis: z.enum(['exact', 'indicative']),
    buy: planLevelSchema,
    entryReference: z.string().nullable(),
    target: protectiveLevelSchema.nullable(),
    stop: protectiveLevelSchema.nullable(),
    startsAt: z.number(),
    deadlineAt: z.number(),
    horizonDays: z.number(),
  }),
});

export type PlanView = z.infer<typeof planViewSchema>;
export type PlanLevel = PlanView['plan']['buy'];
