// Copyright (c) 2026 Ada Technology. All rights reserved.
export { evaluateGoal } from './evaluate-goal.js';
export * from './goal.constant.js';
export { GoalInputError } from './goal.error.js';
export type * from './goal.types.js';
export { classifyGoalWindow, type ClassifyGoalWindowParams } from './goal-window-outcome.js';
export { computeGoalLevels } from './goal-levels.js';
export { parseGoalSpec } from './goal-spec.schema.js';
export { summarizeGoalWindows, type SummarizeGoalParams } from './goal-summary.js';
export { resolveGoalVerdict, type ResolveGoalVerdictParams } from './goal-verdict.js';
export {
  rankGoalCombinations,
  type RankableCombination,
  type RankableEvaluation,
} from './goal-ranking.js';
