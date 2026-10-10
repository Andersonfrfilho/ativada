// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  RUN_PARAMETERS_SCHEMA,
  warnRunParameters,
  type RunParametersInput,
} from '../packages/strategy-engine/src/index.js';

function warningsOf(overrides: Partial<RunParametersInput>, referencePrice: string): string[] {
  const parameters = RUN_PARAMETERS_SCHEMA.parse({
    schemaVersion: 1,
    symbol: 'BTCUSDT',
    timeframe: '1h',
    sentimentSource: 'alternative.me',
    ...overrides,
  });
  return warnRunParameters(parameters, referencePrice).map((warning) => warning.code);
}

describe('run parameter warnings (not errors)', () => {
  test('the defaults on a BTC-like price warn about nothing', () => {
    expect(warningsOf({}, '60000')).toStrictEqual([]);
  });

  test('a tick of 0,01 on a price of 0,53 makes the effective slippage about 1,9%', () => {
    const parameters = RUN_PARAMETERS_SCHEMA.parse({
      schemaVersion: 1,
      symbol: 'XRPUSDT',
      timeframe: '1h',
      sentimentSource: 'alternative.me',
    });
    const [warning] = warnRunParameters(parameters, '0.53');
    expect(warning?.code).toBe('tick_dominates_slippage');
    expect(warning?.message).toContain('1,9%');
    expect(warning?.message).toContain('0,05%');
  });

  test('a tick that stays under the configured slippage is fine', () => {
    expect(warningsOf({ tickSize: '0.01', slippageRate: '0.001' }, '100')).toStrictEqual([]);
  });

  test('a zero slippage only warns when the tick itself is noticeable', () => {
    expect(warningsOf({ slippageRate: '0' }, '60000')).toStrictEqual([]);
    expect(warningsOf({ slippageRate: '0' }, '10')).toStrictEqual(['tick_dominates_slippage']);
  });

  test('a step worth more than the whole balance zeroes the quantity', () => {
    // 1 unidade × 60.000 > 10.000 de saldo.
    expect(warningsOf({ quantityStep: '1' }, '60000')).toStrictEqual([
      'quantity_step_exceeds_balance',
    ]);
  });

  test('a step worth more than 5% of the balance makes the sizing coarse', () => {
    // 0,01 × 60.000 = 600 = 6% de 10.000.
    expect(warningsOf({ quantityStep: '0.01' }, '60000')).toStrictEqual(['quantity_step_coarse']);
    expect(warningsOf({ quantityStep: '0.005' }, '60000')).toStrictEqual([]);
  });

  test('a minimum notional above the balance can never trade', () => {
    expect(
      warningsOf({ initialBalance: '10', minNotional: '50', quantityStep: '0.000001' }, '60000'),
    ).toStrictEqual(['min_notional_exceeds_balance']);
  });

  test('several problems come out together, in a fixed order', () => {
    expect(
      warningsOf(
        { initialBalance: '10', minNotional: '50', quantityStep: '1', tickSize: '1' },
        '60',
      ),
    ).toStrictEqual([
      'tick_dominates_slippage',
      'quantity_step_exceeds_balance',
      'min_notional_exceeds_balance',
    ]);
  });
});
