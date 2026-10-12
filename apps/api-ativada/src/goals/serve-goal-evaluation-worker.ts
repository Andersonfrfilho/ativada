// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import type { EvaluateGoalParams } from '@ativada/strategy-engine';

import type { HorizonComputation, HorizonComputeRequest } from '../horizons/horizon-computation.js';
import type { GoalComputation } from './goal-computation.js';
import {
  GOAL_WORKER_MESSAGE,
  GOAL_WORKER_REQUEST_SCHEMA,
  type GoalWorkerEvent,
  type GoalWorkerRequest,
} from './goal-evaluation-messages.js';

export type GoalComputer = (request: EvaluateGoalParams) => GoalComputation;
export type HorizonComputer = (request: HorizonComputeRequest) => HorizonComputation;

function compute(
  message: GoalWorkerRequest,
  computers: { readonly goal: GoalComputer; readonly horizon: HorizonComputer | undefined },
): GoalWorkerEvent {
  const { id } = message;
  if (message.type === GOAL_WORKER_MESSAGE.COMPUTE) {
    return { type: GOAL_WORKER_MESSAGE.RESULT, id, computation: computers.goal(message.request) };
  }
  if (computers.horizon === undefined) return { type: GOAL_WORKER_MESSAGE.FAILED, id };
  return {
    type: GOAL_WORKER_MESSAGE.HORIZON_RESULT,
    id,
    computation: computers.horizon(message.request),
  };
}

function answer(
  computers: { readonly goal: GoalComputer; readonly horizon: HorizonComputer | undefined },
  data: unknown,
): GoalWorkerEvent | undefined {
  const message = GOAL_WORKER_REQUEST_SCHEMA.safeParse(data);
  if (!message.success) return undefined;
  try {
    return compute(message.data, computers);
  } catch {
    return { type: GOAL_WORKER_MESSAGE.FAILED, id: message.data.id };
  }
}

// Entrada da thread: um pedido por vez, a resposta validada de volta. O erro do motor nunca atravessa (só o `failed`).
export function serveGoalEvaluationWorker(
  computeGoal: GoalComputer,
  computeHorizon?: HorizonComputer,
): void {
  if (parentPort === null)
    throw new Error('serveGoalEvaluationWorker só roda dentro de uma thread.');
  const port = parentPort;
  const computers = { goal: computeGoal, horizon: computeHorizon };
  port.on('message', (data: unknown) => {
    const event = answer(computers, data);
    if (event !== undefined) port.postMessage(event);
  });
  port.postMessage({ type: GOAL_WORKER_MESSAGE.READY });
}
