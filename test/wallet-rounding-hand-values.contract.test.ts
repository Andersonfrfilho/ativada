// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { walletStep } from '../packages/strategy-engine/src/index.js';
import { handStep } from './fixtures/strategy-engine/production/hand-wallet.fixture.js';
import {
  findRoundingDeviation,
  ROUNDING_CASES,
} from './fixtures/strategy-engine/production/rounding-hand-values.fixture.js';

// O dinheiro tem 8 casas e o notional 11: cada arredondamento da carteira tem de acontecer, na direção
// certa (débito sobe, crédito desce, taxa sobe). As contas estão escritas no fixture.
describe('wallet money rounding by hand (tick 1e-8, quantity step 0.001)', () => {
  test.each(ROUNDING_CASES.map((roundingCase) => [roundingCase.label, roundingCase] as const))(
    '%s',
    (_label, roundingCase) => {
      const result = handStep(roundingCase.params);
      expect(roundingCase.observe(result)).toStrictEqual(roundingCase.expected);
    },
  );

  test('the judge helper finds no deviation in production', () => {
    expect(findRoundingDeviation(walletStep)).toBeUndefined();
  });
});
