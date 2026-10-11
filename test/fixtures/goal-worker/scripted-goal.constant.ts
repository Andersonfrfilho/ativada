// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SCRIPTED_GOAL_BEHAVIOR = {
  FAST: 1,
  SLOW: 2,
  HANG: 3,
  EXIT: 4,
  THROW: 5,
} as const;

export const SCRIPTED_WORKER_URL = new URL('./scripted-goal.worker.ts', import.meta.url).href;
export const REAL_WORKER_URL = new URL(
  '../../../apps/api-cryptoada/src/goals/goal-evaluation.worker.ts',
  import.meta.url,
).href;
export const STALE_WORKER_URL = new URL('./stale-result-goal.worker.ts', import.meta.url).href;
