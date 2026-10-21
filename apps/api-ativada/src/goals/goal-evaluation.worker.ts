// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeHorizonLine } from '../horizons/horizon-computation.js';
import { computeGoalCombination } from './goal-computation.js';
import { serveGoalEvaluationWorker } from './serve-goal-evaluation-worker.js';

serveGoalEvaluationWorker(computeGoalCombination, computeHorizonLine);
