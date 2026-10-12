// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import { GOAL_COMPUTATION_KIND } from '../../../apps/api-ativada/src/goals/goal-computation.js';
import {
  GOAL_COMPUTE_REQUEST_SCHEMA,
  GOAL_WORKER_MESSAGE,
} from '../../../apps/api-ativada/src/goals/goal-evaluation-messages.js';

const FIRST_ID = 1;

function reply(id: number, reason: string): void {
  parentPort?.postMessage({
    type: GOAL_WORKER_MESSAGE.RESULT,
    id,
    computation: { kind: GOAL_COMPUTATION_KIND.UNAVAILABLE, reason },
  });
}

// Antes de responder à tarefa N, repete a resposta velha da tarefa 1: a thread só pode ser lida pelo id.
parentPort?.on('message', (data: unknown) => {
  const message = GOAL_COMPUTE_REQUEST_SCHEMA.safeParse(data);
  if (!message.success) return;
  if (message.data.id !== FIRST_ID) reply(FIRST_ID, 'velha');
  reply(message.data.id, `da-tarefa-${message.data.id}`);
});
parentPort?.postMessage({ type: GOAL_WORKER_MESSAGE.READY });
