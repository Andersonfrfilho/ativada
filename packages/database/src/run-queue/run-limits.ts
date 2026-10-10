// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { DEFAULT_RUN_LIMITS, MAXIMUM_RUN_LIMIT } from './run-queue.constant.js';

function limitSchema(fallback: number): z.ZodCatch<z.ZodNumber> {
  return z.number().int().min(1).max(MAXIMUM_RUN_LIMIT).catch(fallback);
}

// `users.limits` é jsonb editável: cada teto inválido ou ausente cai NO PADRÃO (nunca num teto aberto) e as chaves
// que não são de execução (alertas de preço) passam ao largo.
const RUN_LIMITS_SCHEMA = z
  .object({
    maxConcurrentBacktests: limitSchema(DEFAULT_RUN_LIMITS.maxConcurrentBacktests),
    maxConcurrentWalkForwards: limitSchema(DEFAULT_RUN_LIMITS.maxConcurrentWalkForwards),
    maxActiveLivePaperRuns: limitSchema(DEFAULT_RUN_LIMITS.maxActiveLivePaperRuns),
  })
  .catch({ ...DEFAULT_RUN_LIMITS });

export type UserRunLimits = z.infer<typeof RUN_LIMITS_SCHEMA>;

export function readUserRunLimits(raw: unknown): UserRunLimits {
  return RUN_LIMITS_SCHEMA.parse(raw);
}
