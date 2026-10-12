// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  runSourceMutant,
  type SourceEdit,
  type SourceMutantSpec,
  type SourceMutantVerdict,
} from '../source-mutation.fixture.js';
import { HORIZON_MUTANT_VARIABLE } from './horizon-api.fixture.js';

// Quem reprova o mutante do resumo, da recomendação e das constantes: as contas à mão e a regra do spec 003 §5.
export const HORIZON_FAST_JUDGE_TEST_FILES: readonly string[] = [
  'test/horizon-hand-values.contract.test.ts',
  'test/horizon-recommendation.contract.test.ts',
];

// Quem reprova o mutante das janelas: também as propriedades e o diferencial contra o oráculo.
export const HORIZON_FULL_JUDGE_TEST_FILES: readonly string[] = [
  ...HORIZON_FAST_JUDGE_TEST_FILES,
  'test/horizon-properties.contract.test.ts',
  'test/horizon-differential.contract.test.ts',
];

const MUTANT_JUDGE_TIMEOUT_MILLISECONDS = 300_000;

export type HorizonSourceEdit = SourceEdit;
export type HorizonSourceMutant = SourceMutantSpec;
export type HorizonMutantVerdict = SourceMutantVerdict;

export async function runHorizonMutant(
  mutant: HorizonSourceMutant,
  judgeTestFiles: readonly string[] = HORIZON_FAST_JUDGE_TEST_FILES,
): Promise<HorizonMutantVerdict> {
  return runSourceMutant({
    mutant,
    prefix: 'horizon',
    variable: HORIZON_MUTANT_VARIABLE,
    judgeTestFiles,
    timeoutMilliseconds: MUTANT_JUDGE_TIMEOUT_MILLISECONDS,
  });
}
