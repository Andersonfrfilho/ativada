// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  applyLeafEdits,
  groupLeaves,
  listLeaves,
  tunableLeaves,
} from '../src/strategies/config-leaves.js';
import { CLASSIC_CONFIG } from './support/run-fixtures.js';

describe('strategy parameter leaves', () => {
  test('lists the editable numbers and decimals, never ids, kinds or the schema version', () => {
    const keys = listLeaves(CLASSIC_CONFIG).map((leaf) => leaf.key);
    expect(keys).toContain('thresholds.buy');
    expect(keys).toContain('risk.riskPerTrade');
    expect(keys).toContain('rules.ema-9-21.fastPeriod');
    expect(keys).toContain('rules.rsi-14.overbought');
    expect(keys).toContain('regime.weights.trending.trend');
    expect(keys.some((key) => key.endsWith('.id') || key.endsWith('.kind'))).toBe(false);
    expect(keys).not.toContain('schemaVersion');
    expect(keys).not.toContain('entry.orderType');
  });

  test('remembers whether each leaf is a number or a decimal text', () => {
    const byKey = new Map(listLeaves(CLASSIC_CONFIG).map((leaf) => [leaf.key, leaf]));
    expect(byKey.get('risk.atrPeriod')?.kind).toBe('number');
    expect(byKey.get('thresholds.buy')?.kind).toBe('text');
  });

  test('groups the leaves by section, in the order a person reads them', () => {
    const groups = groupLeaves(listLeaves(CLASSIC_CONFIG)).map((group) => group.title);
    expect(groups).toEqual(['Regras', 'Regime', 'Limiares', 'Risco']);
  });

  test('applies edits keeping each type, without touching the original', () => {
    const before = JSON.stringify(CLASSIC_CONFIG);
    const result = applyLeafEdits(CLASSIC_CONFIG, {
      'thresholds.buy': '2.5',
      'rules.rsi-14.period': '21',
    });
    expect(result.problems).toEqual([]);
    const edited = result.config as typeof CLASSIC_CONFIG;
    expect(edited.thresholds.buy).toBe('2.5');
    expect(edited.rules[1]).toEqual({
      id: 'rsi-14',
      kind: 'rsi',
      period: 21,
      oversold: 30,
      overbought: 70,
    });
    expect(edited.risk).toEqual(CLASSIC_CONFIG.risk);
    expect(JSON.stringify(CLASSIC_CONFIG)).toBe(before);
  });

  test('refuses text that is not a plain number, reporting every bad field', () => {
    const result = applyLeafEdits(CLASSIC_CONFIG, {
      'thresholds.buy': 'abc',
      'risk.atrPeriod': '1.5e2',
      'risk.riskPerTrade': ' ',
    });
    expect(result.problems.map((problem) => problem.key)).toEqual([
      'thresholds.buy',
      'risk.atrPeriod',
      'risk.riskPerTrade',
    ]);
  });

  test('a whole-number field refuses decimals', () => {
    expect(applyLeafEdits(CLASSIC_CONFIG, { 'risk.atrPeriod': '14.5' }).problems).toHaveLength(1);
  });

  test('ignores an edit for a leaf that does not exist', () => {
    const result = applyLeafEdits(CLASSIC_CONFIG, { 'nope.nothing': '1' });
    expect(result.config).toEqual(CLASSIC_CONFIG);
  });

  test('offers for the walk-forward grid only the catalog parameters', () => {
    const keys = tunableLeaves(listLeaves(CLASSIC_CONFIG)).map((leaf) => leaf.key);
    expect(keys).toContain('thresholds.buy');
    expect(keys).toContain('rules.ema-9-21.fastPeriod');
    expect(keys).toContain('risk.stopAtrMultiple');
    expect(keys).not.toContain('regime.weights.trending.trend');
  });
});
