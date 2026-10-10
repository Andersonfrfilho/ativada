// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  runSourceMutant,
  type SourceEdit,
  type SourceMutantSpec,
  type SourceMutantVerdict,
} from '../source-mutation.fixture.js';
import { TRIGGER_MUTANT_VARIABLE } from './trigger-api.fixture.js';

// Quem reprova o mutante: a tabela à mão por família e o fechamento calculado contra o motor de produção.
export const TRIGGER_JUDGE_TEST_FILES: readonly string[] = [
  'test/next-trigger.contract.test.ts',
  'test/next-trigger-engine.contract.test.ts',
];

export type TriggerSourceEdit = SourceEdit;
export type TriggerSourceMutant = SourceMutantSpec;
export type TriggerMutantVerdict = SourceMutantVerdict;

export async function runTriggerMutant(mutant: TriggerSourceMutant): Promise<TriggerMutantVerdict> {
  return runSourceMutant({
    mutant,
    prefix: 'trigger',
    variable: TRIGGER_MUTANT_VARIABLE,
    judgeTestFiles: TRIGGER_JUDGE_TEST_FILES,
  });
}
