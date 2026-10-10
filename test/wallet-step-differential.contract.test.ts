// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { walletStep } from '../packages/strategy-engine/src/index.js';
import {
  compareWalletImplementations,
  REFERENCE_WALLET,
} from './fixtures/strategy-engine/wallet/wallet-differential.fixture.js';
import {
  WALLET_FLOW_COUNT,
  WALLET_FLOW_MAX_CANDLES,
  WALLET_FLOW_MIN_CANDLES,
} from './fixtures/strategy-engine/wallet/wallet-flow.fixture.js';
import { findFirstViolation } from './fixtures/strategy-engine/wallet/wallet-properties.fixture.js';

const TIMEOUT_MILLISECONDS = 600_000;

describe('walletStep: production against the independent reference', () => {
  test(
    'state and every decision are identical, byte for byte, on thousands of generated flows',
    () => {
      const report = compareWalletImplementations({
        production: walletStep,
        reference: REFERENCE_WALLET,
      });
      expect(WALLET_FLOW_COUNT).toBeGreaterThanOrEqual(3_000);
      expect(report.flows).toBe(WALLET_FLOW_COUNT);
      expect(report.steps).toBeGreaterThan(WALLET_FLOW_COUNT * WALLET_FLOW_MIN_CANDLES);
      expect(report.steps).toBeLessThanOrEqual(WALLET_FLOW_COUNT * WALLET_FLOW_MAX_CANDLES);
      expect(report.divergences.slice(0, 1)).toStrictEqual([]);
      expect(report.divergences).toHaveLength(0);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'the properties hold on every execution: cash, one position, equity, risk at the stop, timing',
    () => {
      expect(findFirstViolation(walletStep)).toBeUndefined();
    },
    TIMEOUT_MILLISECONDS,
  );
});
