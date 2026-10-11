// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildBacktestRequest,
  defaultFormValues,
  validateBacktestForm,
  type BacktestFormValues,
} from '../src/backtests/backtest-form.validation.js';

const NOW = Date.parse('2026-10-11T15:30:00.000Z');

function valid(): BacktestFormValues {
  return { ...defaultFormValues(NOW, 'BTCUSDT'), strategyId: 's', versionId: 'v' };
}

describe('backtest form', () => {
  test('defaults to the last 180 closed days in UTC, with the documented costs', () => {
    const values = defaultFormValues(NOW, 'BTCUSDT');
    expect(values.end).toBe('2026-10-10');
    expect(values.start).toBe('2026-04-13');
    expect([values.initialBalance, values.feeRate, values.slippageRate]).toEqual([
      '10000',
      '0.001',
      '0.0005',
    ]);
    expect(validateBacktestForm(valid())).toEqual([]);
  });

  test('reports every problem at once, by field name', () => {
    const fields = validateBacktestForm({
      ...valid(),
      versionId: '',
      initialBalance: '0',
      feeRate: '1',
      slippageRate: '-1',
      start: '2026-05-01',
      end: '2026-04-01',
    }).map((problem) => problem.field);
    expect(fields).toEqual(['Versão', 'Capital inicial', 'Taxa por ordem', 'Slippage', 'Fim']);
  });

  test('accepts decimals but not exponents, signs or commas', () => {
    for (const bad of ['1e3', '+5', '1,5', ' 10', '']) {
      expect(validateBacktestForm({ ...valid(), initialBalance: bad })).not.toEqual([]);
    }
    expect(validateBacktestForm({ ...valid(), initialBalance: '250.75' })).toEqual([]);
  });

  test('builds the body with epoch milliseconds at 00:00 UTC and decimals as text', () => {
    expect(buildBacktestRequest(valid())).toEqual({
      strategyVersionId: 'v',
      kind: 'backtest',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      periodStart: Date.parse('2026-04-13T00:00:00.000Z'),
      periodEnd: Date.parse('2026-10-10T00:00:00.000Z'),
      runParameters: { initialBalance: '10000', feeRate: '0.001', slippageRate: '0.0005' },
    });
  });
});
