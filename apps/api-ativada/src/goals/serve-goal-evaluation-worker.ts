// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import type { EvaluateGoalParams } from '@ativada/strategy-engine';

import type { GoalComputation } from './goal-computation.js';
import {
  GOAL_COMPUTE_REQUEST_SCHEMA,
  GOAL_WORKER_MESSAGE,
  type GoalWorkerEvent,
} from './goal-evaluation-messages.js';

export type GoalComputer = (request: EvaluateGoalParams) => GoalComputation;

function answer(compute: GoalComputer, data: unknown): GoalWorkerEvent | undefined {
  const message = GOAL_COMPUTE_REQUEST_SCHEMA.safeParse(data);
  if (!message.success) return undefined;
  const { id, request } = message.data;
  try {
    return { type: GOAL_WORKER_MESSAGE.RESULT, id, computation: compute(request) };
  } catch {
    return { type: GOAL_WORKER_MESSAGE.FAILED, id };
  }
}

// Entrada da thread: um pedido por vez, a resposta validada de volta. O erro do motor nunca atravessa (só o `failed`).
export function serveGoalEvaluationWorker(compute: GoalComputer): void {
  if (parentPort === null)
    throw new Error('serveGoalEvaluationWorker só roda dentro de uma thread.');
  const port = parentPort;
  port.on('message', (data: unknown) => {
    const event = answer(compute, data);
    if (event !== undefined) port.postMessage(event);
  });
  port.postMessage({ type: GOAL_WORKER_MESSAGE.READY });
}
