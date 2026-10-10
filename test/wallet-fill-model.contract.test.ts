// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { simulatedFillModel } from '../packages/strategy-engine/src/index.js';
import { compareFillModels } from './fixtures/strategy-engine/wallet/wallet-differential.fixture.js';
import {
  COVERAGE,
  measureCoverage,
} from './fixtures/strategy-engine/wallet/wallet-coverage.fixture.js';
import { WALLET_FLOW_COUNT } from './fixtures/strategy-engine/wallet/wallet-flow.fixture.js';

const DIFFERENTIAL_TIMEOUT_MILLISECONDS = 600_000;
const MINIMUM_PER_PATH = 100;

describe('simulated fill model: production against the independent reference', () => {
  test(
    'state and every decision are identical, byte for byte, on thousands of generated flows',
    () => {
      const report = compareFillModels({ production: simulatedFillModel });
      expect(report.flows).toBe(WALLET_FLOW_COUNT);
      expect(report.divergences.slice(0, 1)).toStrictEqual([]);
      expect(report.divergences).toHaveLength(0);
    },
    DIFFERENTIAL_TIMEOUT_MILLISECONDS,
  );

  test('the generated flows exercise every fill path many times (no vacuous differential)', () => {
    const coverage = measureCoverage();
    for (const kind of Object.values(COVERAGE)) {
      expect([kind, (coverage[kind] ?? 0) >= MINIMUM_PER_PATH]).toStrictEqual([kind, true]);
    }
  });
});
