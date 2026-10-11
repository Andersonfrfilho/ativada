// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import type { Environment } from '../environment.js';
import { createGoalEvaluationPool, type GoalEvaluationPool } from './goal-evaluation-pool.js';

// A avaliação de metas é cálculo síncrono do motor: roda num pool limitado de threads, nunca na thread da API.
export function createApplicationGoalPool(
  environment: Pick<Environment, 'GOAL_EVALUATION_THREADS' | 'GOAL_EVALUATION_TIMEOUT_SECONDS'>,
): GoalEvaluationPool {
  return createGoalEvaluationPool({
    workerUrl: new URL('./goal-evaluation.worker.ts', import.meta.url).href,
    size: environment.GOAL_EVALUATION_THREADS,
    timeoutMilliseconds: environment.GOAL_EVALUATION_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
  });
}
