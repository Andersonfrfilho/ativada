// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const THREADS_EXPECTATION = 'inteiro entre 1 e 4';
const MAX_THREADS = 4;
const DEFAULT_THREADS = 2;
const TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 300';
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 300;
const DEFAULT_TIMEOUT_SECONDS = 30;
const CONCURRENT_EXPECTATION = 'inteiro entre 1 e 32';
const MAX_CONCURRENT = 32;
const DEFAULT_CONCURRENT = 4;

function boundedInteger(params: {
  readonly expectation: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly fallback: number;
}): z.ZodDefault<z.ZodCoercedNumber> {
  return z.coerce
    .number({ error: params.expectation })
    .int({ error: params.expectation })
    .min(params.minimum, { error: params.expectation })
    .max(params.maximum, { error: params.expectation })
    .default(params.fallback);
}

// A avaliação de metas roda num pool pequeno de `worker_threads` (nunca na thread da API): quantas threads, quanto tempo
// uma avaliação tem e quantas avaliações a frio cabem ao mesmo tempo antes de a API responder 503.
export const goalEvaluationEnvironmentShape = {
  GOAL_EVALUATION_THREADS: boundedInteger({
    expectation: THREADS_EXPECTATION,
    minimum: 1,
    maximum: MAX_THREADS,
    fallback: DEFAULT_THREADS,
  }),
  GOAL_EVALUATION_TIMEOUT_SECONDS: boundedInteger({
    expectation: TIMEOUT_EXPECTATION,
    minimum: MIN_TIMEOUT_SECONDS,
    maximum: MAX_TIMEOUT_SECONDS,
    fallback: DEFAULT_TIMEOUT_SECONDS,
  }),
  GOAL_EVALUATION_MAX_CONCURRENT: boundedInteger({
    expectation: CONCURRENT_EXPECTATION,
    minimum: 1,
    maximum: MAX_CONCURRENT,
    fallback: DEFAULT_CONCURRENT,
  }),
} as const;
