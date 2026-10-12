// Copyright (c) 2026 Ada Technology. All rights reserved.
import { availableParallelism } from 'node:os';

import { RUN_ORPHAN_POLICY } from '@ativada/database';
import { z } from '@ativada/environment';

const GLOBAL_CONCURRENCY_EXPECTATION = 'inteiro entre 1 e 32';
const MIN_GLOBAL_CONCURRENCY = 1;
const MAX_GLOBAL_CONCURRENCY = 32;
const QUEUE_LIMIT_EXPECTATION = 'inteiro entre 1 e 1000';
const MAX_QUEUE_PER_USER_LIMIT = 1_000;
const DEFAULT_QUEUE_PER_USER_LIMIT = 20;
const HEARTBEAT_INTERVAL_EXPECTATION = 'inteiro de segundos entre 1 e 300';
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 15;
const HEARTBEAT_TIMEOUT_EXPECTATION = 'inteiro de segundos entre 5 e 3600';
const MIN_HEARTBEAT_TIMEOUT_SECONDS = 5;
const MAX_HEARTBEAT_TIMEOUT_SECONDS = 3_600;
const DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
const ORPHAN_POLICY_EXPECTATION = 'resume (retomar as com checkpoint) ou fail (falhar todas)';

export const HEARTBEAT_ORDER_EXPECTATION =
  'RUN_HEARTBEAT_TIMEOUT_SECONDS precisa ser maior que RUN_HEARTBEAT_INTERVAL_SECONDS';

function integerInRange(params: {
  readonly expectation: string;
  readonly min: number;
  readonly max: number;
}): z.ZodCoercedNumber<unknown> {
  return z.coerce
    .number({ error: params.expectation })
    .int({ error: params.expectation })
    .min(params.min, { error: params.expectation })
    .max(params.max, { error: params.expectation });
}

// Quantas execuções esta instância roda ao mesmo tempo: núcleos − 1, no mínimo 1 e no máximo 32.
const DEFAULT_GLOBAL_CONCURRENCY = Math.min(
  MAX_GLOBAL_CONCURRENCY,
  Math.max(MIN_GLOBAL_CONCURRENCY, availableParallelism() - 1),
);

// A fila durável de execuções (T3.6): teto global da instância, fila por usuário, batimento e política das órfãs.
export const runQueueEnvironmentShape = {
  RUN_GLOBAL_CONCURRENCY: integerInRange({
    expectation: GLOBAL_CONCURRENCY_EXPECTATION,
    min: MIN_GLOBAL_CONCURRENCY,
    max: MAX_GLOBAL_CONCURRENCY,
  }).default(DEFAULT_GLOBAL_CONCURRENCY),
  RUN_QUEUE_PER_USER_LIMIT: integerInRange({
    expectation: QUEUE_LIMIT_EXPECTATION,
    min: 1,
    max: MAX_QUEUE_PER_USER_LIMIT,
  }).default(DEFAULT_QUEUE_PER_USER_LIMIT),
  RUN_HEARTBEAT_INTERVAL_SECONDS: integerInRange({
    expectation: HEARTBEAT_INTERVAL_EXPECTATION,
    min: 1,
    max: MAX_HEARTBEAT_INTERVAL_SECONDS,
  }).default(DEFAULT_HEARTBEAT_INTERVAL_SECONDS),
  RUN_HEARTBEAT_TIMEOUT_SECONDS: integerInRange({
    expectation: HEARTBEAT_TIMEOUT_EXPECTATION,
    min: MIN_HEARTBEAT_TIMEOUT_SECONDS,
    max: MAX_HEARTBEAT_TIMEOUT_SECONDS,
  }).default(DEFAULT_HEARTBEAT_TIMEOUT_SECONDS),
  RUN_ORPHAN_POLICY: z
    .enum(RUN_ORPHAN_POLICY, { error: ORPHAN_POLICY_EXPECTATION })
    .default(RUN_ORPHAN_POLICY.RESUME_WITH_CHECKPOINT),
};

export function isHeartbeatTimeoutAfterInterval(values: {
  readonly RUN_HEARTBEAT_INTERVAL_SECONDS: number;
  readonly RUN_HEARTBEAT_TIMEOUT_SECONDS: number;
}): boolean {
  return values.RUN_HEARTBEAT_TIMEOUT_SECONDS > values.RUN_HEARTBEAT_INTERVAL_SECONDS;
}
