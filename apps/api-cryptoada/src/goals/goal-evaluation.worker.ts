// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeGoalCombination } from './goal-computation.js';
import { serveGoalEvaluationWorker } from './serve-goal-evaluation-worker.js';

serveGoalEvaluationWorker(computeGoalCombination);
