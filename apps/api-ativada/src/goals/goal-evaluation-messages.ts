// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import type { EvaluateGoalParams } from '@ativada/strategy-engine';

import {
  HORIZON_COMPUTATION_KIND,
  type HorizonComputation,
  type HorizonComputeRequest,
} from '../horizons/horizon-computation.js';
import { GOAL_COMPUTATION_KIND, type GoalComputation } from './goal-computation.js';

export const GOAL_WORKER_MESSAGE = {
  READY: 'ready',
  COMPUTE: 'compute',
  RESULT: 'result',
  FAILED: 'failed',
  COMPUTE_HORIZON: 'compute-horizon',
  HORIZON_RESULT: 'horizon-result',
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

function isHorizonComputation(value: unknown): value is HorizonComputation {
  return (
    isRecord(value) &&
    (value['kind'] === HORIZON_COMPUTATION_KIND.COMPUTED ||
      value['kind'] === HORIZON_COMPUTATION_KIND.UNAVAILABLE)
  );
}

const TASK_ID = z.number().int().nonnegative();

// O canal é entre a API e a thread dela: o formato do pedido e da resposta é nosso, e a forma é conferida nas duas pontas.
export const GOAL_COMPUTE_REQUEST_SCHEMA = z.object({
  type: z.literal(GOAL_WORKER_MESSAGE.COMPUTE),
  id: TASK_ID,
  request: z.custom<EvaluateGoalParams>(isRecord),
});

export const HORIZON_COMPUTE_REQUEST_SCHEMA = z.object({
  type: z.literal(GOAL_WORKER_MESSAGE.COMPUTE_HORIZON),
  id: TASK_ID,
  request: z.custom<HorizonComputeRequest>(isRecord),
});

export const GOAL_WORKER_REQUEST_SCHEMA = z.discriminatedUnion('type', [
  GOAL_COMPUTE_REQUEST_SCHEMA,
  HORIZON_COMPUTE_REQUEST_SCHEMA,
]);

export const GOAL_WORKER_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.object({ type: z.literal(GOAL_WORKER_MESSAGE.READY) }),
  z.object({
    type: z.literal(GOAL_WORKER_MESSAGE.RESULT),
    id: TASK_ID,
    computation: z.custom<GoalComputation>(isComputation),
  }),
  z.object({
    type: z.literal(GOAL_WORKER_MESSAGE.HORIZON_RESULT),
    id: TASK_ID,
    computation: z.custom<HorizonComputation>(isHorizonComputation),
  }),
  z.object({ type: z.literal(GOAL_WORKER_MESSAGE.FAILED), id: TASK_ID }),
]);

export type GoalComputeRequest = z.infer<typeof GOAL_COMPUTE_REQUEST_SCHEMA>;
export type GoalWorkerRequest = z.infer<typeof GOAL_WORKER_REQUEST_SCHEMA>;
export type GoalWorkerEvent = z.infer<typeof GOAL_WORKER_EVENT_SCHEMA>;
