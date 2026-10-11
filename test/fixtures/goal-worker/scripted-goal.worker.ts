// Copyright (c) 2026 Ada Technology. All rights reserved.
import { threadId } from 'node:worker_threads';

import { GOAL_COMPUTATION_KIND } from '../../../apps/api-cryptoada/src/goals/goal-computation.js';
import { serveGoalEvaluationWorker } from '../../../apps/api-cryptoada/src/goals/serve-goal-evaluation-worker.js';
import { SCRIPTED_GOAL_BEHAVIOR } from './scripted-goal.constant.js';

function spinFor(milliseconds: number): void {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) {
    // espera ocupada de propósito: simula o cálculo síncrono do motor
  }
}

// O roteiro vem em `goal.horizonDays` do pedido: cada valor é um comportamento da thread.
serveGoalEvaluationWorker((request) => {
  const behavior = request.goal.horizonDays;
  if (behavior === SCRIPTED_GOAL_BEHAVIOR.HANG) {
    for (;;) spinFor(1_000);
  }
  if (behavior === SCRIPTED_GOAL_BEHAVIOR.EXIT) process.exit(1);
  if (behavior === SCRIPTED_GOAL_BEHAVIOR.THROW) throw new Error('quebrou de propósito');
  spinFor(behavior === SCRIPTED_GOAL_BEHAVIOR.SLOW ? 250 : 0);
  return { kind: GOAL_COMPUTATION_KIND.UNAVAILABLE, reason: `thread-${threadId}` };
});
