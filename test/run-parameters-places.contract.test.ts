// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createRunSetup,
  RunParametersError,
  type RunParametersInput,
} from '../packages/strategy-engine/src/index.js';
import { loadClassicRunParameters } from './fixtures/strategy-engine/engine-scenarios.fixture.js';

// O dinheiro é numeric(24,8): nenhum campo monetário nem taxa entra com mais de 8 casas decimais.
const TWELVE_PLACES = '0.000000000001';
const NINE_PLACES = '0.000000001';

function issuePaths(overrides: Partial<RunParametersInput>): string[] {
  try {
    createRunSetup({ ...loadClassicRunParameters(), ...overrides });
  } catch (error) {
    if (error instanceof RunParametersError) return error.issues.map((issue) => issue.path);
    throw error;
  }
  return [];
}

describe('run parameters keep at most 8 decimal places in money and rates', () => {
  test.each([
    ['tickSize', { tickSize: TWELVE_PLACES }],
    ['quantityStep', { quantityStep: TWELVE_PLACES }],
    ['minNotional', { minNotional: NINE_PLACES }],
    ['initialBalance', { initialBalance: '10.123456789' }],
    ['feeRate', { feeRate: NINE_PLACES }],
    ['slippageRate', { slippageRate: NINE_PLACES }],
  ] as const)('%s with more than 8 places is refused', (field, overrides) => {
    expect(issuePaths(overrides)).toStrictEqual([field]);
  });

  test('exactly 8 places are accepted in every one of those fields', () => {
    expect(
      issuePaths({
        tickSize: '0.00000001',
        quantityStep: '0.00000001',
        minNotional: '0.00000001',
        initialBalance: '10.12345678',
        feeRate: '0.00000001',
        slippageRate: '0.00000001',
      }),
    ).toStrictEqual([]);
  });
});
