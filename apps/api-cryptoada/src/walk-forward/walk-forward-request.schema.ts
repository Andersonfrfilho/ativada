// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import { canonicalJson, DEFAULT_MIN_TRADES_PER_WINDOW } from '@cryptoada/strategy-engine';
import { z } from '@cryptoada/environment';

import type { WalkForwardRequest } from './walk-forward.types.js';

const MONTHS_MAXIMUM = 120;
const MIN_TRADES_MAXIMUM = 10_000;

const monthsSchema = z.int().min(1).max(MONTHS_MAXIMUM);

// A forma do pedido (a grade em si é validada pelo catálogo FECHADO do motor, que conhece as regras da estratégia).
export const WALK_FORWARD_REQUEST_SCHEMA = z.strictObject({
  grid: z.unknown(),
  trainMonths: monthsSchema.optional(),
  testMonths: monthsSchema.optional(),
  stepMonths: monthsSchema.optional(),
  minTradesPerWindow: z.int().min(1).max(MIN_TRADES_MAXIMUM).optional(),
});

export type NormalizedWalkForwardRequest = {
  readonly grid: unknown;
  readonly trainMonths: number | undefined;
  readonly testMonths: number | undefined;
  readonly stepMonths: number | undefined;
  readonly minTradesPerWindow: number;
};

export function normalizeRequest(request: WalkForwardRequest): NormalizedWalkForwardRequest {
  return {
    grid: request.grid,
    trainMonths: request.trainMonths,
    testMonths: request.testMonths,
    stepMonths: request.stepMonths,
    minTradesPerWindow: request.minTradesPerWindow ?? DEFAULT_MIN_TRADES_PER_WINDOW,
  };
}

// O que identifica o pedido: o mesmo pedido dá o mesmo hash; o checkpoint recusa uma retomada com outro.
export function hashWalkForwardRequest(request: NormalizedWalkForwardRequest): string {
  const fingerprint = {
    grid: request.grid ?? null,
    trainMonths: request.trainMonths ?? null,
    testMonths: request.testMonths ?? null,
    stepMonths: request.stepMonths ?? null,
    minTradesPerWindow: request.minTradesPerWindow,
  };
  return createHash('sha256').update(canonicalJson(fingerprint)).digest('hex');
}
