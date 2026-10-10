// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  runSourceMutant,
  type SourceEdit,
  type SourceMutantSpec,
  type SourceMutantVerdict,
} from '../source-mutation.fixture.js';
import { GOAL_MUTANT_VARIABLE } from './goal-api.fixture.js';

// Quem reprova o mutante: as contas à mão, o diferencial contra o oráculo e a avaliação.
export const GOAL_JUDGE_TEST_FILES: readonly string[] = [
  'test/goal-hand-values.contract.test.ts',
  'test/goal-evaluation.contract.test.ts',
  'test/goal-differential.contract.test.ts',
];

export type GoalSourceEdit = SourceEdit;
export type GoalSourceMutant = SourceMutantSpec;
export type GoalMutantVerdict = SourceMutantVerdict;

export async function runGoalMutant(mutant: GoalSourceMutant): Promise<GoalMutantVerdict> {
  return runSourceMutant({
    mutant,
    prefix: 'goal',
    variable: GOAL_MUTANT_VARIABLE,
    judgeTestFiles: GOAL_JUDGE_TEST_FILES,
  });
}
