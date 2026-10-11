// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { decimalText, nullableDecimalText } from '../http/decimal.validation.js';

const planLevelSchema = z.object({
  status: z.enum(['price', 'already_active', 'unreachable']),
  price: nullableDecimalText,
  trigger: z.enum(['at_or_above', 'at_or_below']).nullable(),
  direction: z.enum(['above', 'below']).nullable(),
  distance: nullableDecimalText,
  distanceRate: nullableDecimalText,
});

const protectiveLevelSchema = z.object({ rate: decimalText, price: decimalText });

export const planViewSchema = z.object({
  strategy: z.object({ id: z.string(), name: z.string(), version: z.number() }),
  symbol: z.string(),
  plan: z.object({
    lastClose: decimalText,
    basis: z.enum(['exact', 'indicative']),
    buy: planLevelSchema,
    entryReference: nullableDecimalText,
    target: protectiveLevelSchema.nullable(),
    stop: protectiveLevelSchema.nullable(),
    startsAt: z.number(),
    deadlineAt: z.number(),
    horizonDays: z.number(),
  }),
});

export type PlanView = z.infer<typeof planViewSchema>;
export type PlanLevel = PlanView['plan']['buy'];
