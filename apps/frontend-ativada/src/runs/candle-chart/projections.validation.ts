// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/runs/:runId/projections` (ADR 0002, spec 009, P3 a P7). Números e frases vêm prontos do
// servidor: o painel não refaz a regra nem o veredito, só mostra.
export const PROJECTION_VERSION = 'projection-1';

const nullableDecimal = decimalText.nullable();
const count = z.number().int().nonnegative();
const side = z.enum(['buy', 'sell', 'none']);
const strength = z.enum(['weak', 'strong', 'decided']);

const itemSchema = z.object({
  candleTime: z.number(),
  closedAt: z.number(),
  side,
  strength: strength.nullable(),
  score: decimalText,
  base: decimalText,
  bandLow: nullableDecimal,
  bandHigh: nullableDecimal,
  nextClose: nullableDecimal,
  moveRate: nullableDecimal,
  result: z.enum(['hit', 'miss', 'tie', 'no_side', 'pending', 'gap']),
  isInside: z.boolean().nullable(),
});

const currentSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    candleTime: z.number(),
    closedAt: z.number(),
    horizonEndsAt: z.number(),
    side: z.enum(['buy', 'sell']),
    stance: z.enum(['buy', 'hold', 'sell', 'stay_out']),
    strength,
    score: decimalText,
    threshold: decimalText,
    base: decimalText,
    bandLow: nullableDecimal,
    bandHigh: nullableDecimal,
    atr: nullableDecimal,
    label: z.string(),
    message: z.string(),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum([
      'not_running',
      'stalled',
      'waiting_for_data',
      'read_failed',
      'no_candle',
      'warming_up',
      'neutral',
      'team_run',
    ]),
    message: z.string(),
  }),
]);

const summarySchema = z.object({
  counted: count,
  hits: count,
  misses: count,
  ties: count,
  noSide: count,
  pending: count,
  upMoves: count,
  banded: count,
  inside: count,
  hitRate: nullableDecimal,
  upRate: nullableDecimal,
  insideRate: nullableDecimal,
  byStrength: z.array(
    z.object({ strength, counted: count, hits: count, hitRate: nullableDecimal }),
  ),
  wilson: z.object({ lower: decimalText, upper: decimalText }).nullable(),
  verdict: z.enum(['above', 'even', 'below', 'too_few']),
  message: z.string(),
  verdictMessage: z.string(),
});

// Uma página por cursor traz só as previsões: a tendência e o resumo vão apenas na primeira página (aditivo no servidor).
export const projectionsPageSchema = z.object({
  version: z.literal(PROJECTION_VERSION),
  timeframe: z.string(),
  items: z.array(itemSchema),
  nextCursor: z.string().nullable(),
});

export const projectionsSchema = projectionsPageSchema.extend({
  current: currentSchema,
  // A execução de equipe não tem placar nem acertos para contar: o servidor omite o resumo e `current` diz por quê.
  summary: summarySchema.optional(),
});

export type ProjectionsPage = z.infer<typeof projectionsPageSchema>;
export type Projections = z.infer<typeof projectionsSchema>;
export type ProjectionCurrent = Projections['current'];
export type AvailableProjection = Extract<ProjectionCurrent, { status: 'available' }>;
export type ProjectionSummary = NonNullable<Projections['summary']>;
export type ProjectionItem = Projections['items'][number];
