// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import type { EvaluateGoalParams } from '@cryptoada/strategy-engine';

import { GOAL_COMPUTATION_KIND, type GoalComputation } from './goal-computation.js';

export const GOAL_WORKER_MESSAGE = {
  READY: 'ready',
  COMPUTE: 'compute',
  RESULT: 'result',
  FAILED: 'failed',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isComputation(value: unknown): value is GoalComputation {
  return (
    isRecord(value) &&
    (value['kind'] === GOAL_COMPUTATION_KIND.COMPUTED ||
      value['kind'] === GOAL_COMPUTATION_KIND.UNAVAILABLE)
  );
}

// O canal é entre a API e a thread dela: o formato do pedido e da resposta é nosso, e a forma é conferida nas duas pontas.
export const GOAL_COMPUTE_REQUEST_SCHEMA = z.object({
  type: z.literal(GOAL_WORKER_MESSAGE.COMPUTE),
  id: z.number().int().nonnegative(),
  request: z.custom<EvaluateGoalParams>(isRecord),
});

export const GOAL_WORKER_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.object({ type: z.literal(GOAL_WORKER_MESSAGE.READY) }),
  z.object({
    type: z.literal(GOAL_WORKER_MESSAGE.RESULT),
    id: z.number().int().nonnegative(),
    computation: z.custom<GoalComputation>(isComputation),
  }),
  z.object({ type: z.literal(GOAL_WORKER_MESSAGE.FAILED), id: z.number().int().nonnegative() }),
]);

export type GoalComputeRequest = z.infer<typeof GOAL_COMPUTE_REQUEST_SCHEMA>;
export type GoalWorkerEvent = z.infer<typeof GOAL_WORKER_EVENT_SCHEMA>;
