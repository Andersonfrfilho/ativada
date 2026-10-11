// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { listLeaves } from '../src/strategies/config-leaves.js';
import {
  buildWalkForwardRequest,
  countCombinations,
  validateWalkForwardForm,
  type WalkForwardFormValues,
} from '../src/strategies/walk-forward-form.validation.js';
import { CLASSIC_CONFIG } from './support/run-fixtures.js';

const LEAVES = listLeaves(CLASSIC_CONFIG);

function form(overrides: Partial<WalkForwardFormValues> = {}): WalkForwardFormValues {
  return {
    versionId: 'v',
    symbol: 'BTCUSDT',
    timeframe: '1d',
    start: '2024-01-01',
    end: '2026-01-01',
    rows: [{ key: 'thresholds.buy', values: '1.5, 2, 2.5' }],
    ...overrides,
  };
}

describe('walk-forward form', () => {
  test('counts the combinations of the grid', () => {
    expect(countCombinations(form().rows)).toBe(3);
    expect(
      countCombinations([
        { key: 'a', values: '1,2,3' },
        { key: 'b', values: '4,5' },
      ]),
    ).toBe(6);
  });

  test('builds the grid with decimal text for decimal fields and integers for whole-number fields', () => {
    const request = buildWalkForwardRequest(
      form({
        rows: [
          { key: 'thresholds.buy', values: '1.5, 2' },
          { key: 'rules.rsi-14.period', values: '10,14' },
        ],
      }),
      LEAVES,
    );
    expect(request).toEqual({
      strategyVersionId: 'v',
      kind: 'walk_forward',
      symbol: 'BTCUSDT',
      timeframe: '1d',
      periodStart: Date.parse('2024-01-01T00:00:00.000Z'),
      periodEnd: Date.parse('2026-01-01T00:00:00.000Z'),
      grid: {
        parameters: [
          { path: 'thresholds.buy', values: ['1.5', '2'] },
          { path: 'rules.rsi-14.period', values: [10, 14] },
        ],
      },
    });
  });

  test('reports every problem at once', () => {
    const fields = validateWalkForwardForm(
      form({
        versionId: '',
        start: '2026-01-01',
        end: '2024-01-01',
        rows: [
          { key: 'thresholds.buy', values: '1.5, abc' },
          { key: 'thresholds.buy', values: '2' },
          { key: 'risk.atrPeriod', values: '' },
        ],
      }),
      LEAVES,
    ).map((problem) => problem.field);
    expect(fields).toEqual(['Versão', 'Fim', 'Parâmetro 1', 'Parâmetro 2', 'Parâmetro 3']);
  });

  test('refuses more combinations than the API accepts, before sending', () => {
    const many = Array.from({ length: 15 }, (_, index) => String(index + 1)).join(',');
    const problems = validateWalkForwardForm(
      form({
        rows: [
          { key: 'risk.atrPeriod', values: many },
          { key: 'regime.period', values: many },
        ],
      }),
      LEAVES,
    );
    expect(problems.map((problem) => problem.field)).toEqual(['Grade']);
  });

  test('a whole-number field refuses decimal values', () => {
    const problems = validateWalkForwardForm(
      form({ rows: [{ key: 'risk.atrPeriod', values: '10.5, 14' }] }),
      LEAVES,
    );
    expect(problems).toHaveLength(1);
  });
});
