// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  runSourceMutant,
  type SourceEdit,
  type SourceMutantSpec,
  type SourceMutantVerdict,
} from '../source-mutation.fixture.js';
import { PLAN_MUTANT_VARIABLE } from './plan-api.fixture.js';

// Quem reprova o mutante: as contas à mão e o fechamento calculado contra o motor de produção.
export const PLAN_JUDGE_TEST_FILES: readonly string[] = [
  'test/operation-plan-hand-values.contract.test.ts',
  'test/operation-plan-engine.contract.test.ts',
  'test/operation-plan-search.contract.test.ts',
];

const MUTANT_JUDGE_TIMEOUT_MILLISECONDS = 90_000;

export type PlanSourceEdit = SourceEdit;
export type PlanSourceMutant = SourceMutantSpec;
export type PlanMutantVerdict = SourceMutantVerdict;

export async function runPlanMutant(
  mutant: PlanSourceMutant,
  judgeTestFiles: readonly string[] = PLAN_JUDGE_TEST_FILES,
): Promise<PlanMutantVerdict> {
  return runSourceMutant({
    mutant,
    prefix: 'plan',
    variable: PLAN_MUTANT_VARIABLE,
    judgeTestFiles,
    timeoutMilliseconds: MUTANT_JUDGE_TIMEOUT_MILLISECONDS,
  });
}
