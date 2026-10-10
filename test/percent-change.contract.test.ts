// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadTickerApi } from './fixtures/ticker/ticker-source.fixture.js';

const { percent } = await loadTickerApi();

describe('computeChangePercent — exact decimal arithmetic, 4 places', () => {
  test.each([
    ['100', '101', '1.0000'],
    ['100', '99', '-1.0000'],
    ['100', '100', '0.0000'],
    ['0.0010', '0.0025', '150.0000'],
    ['29500.00000000', '30000.50000000', '1.6966'],
    ['3.00000000', '2.00000000', '-33.3333'],
    ['3.00000000', '4.00000000', '33.3333'],
    ['0.00000003', '0.00000004', '33.3333'],
    ['1', '1.00005', '0.0050'],
    ['1', '1.000049', '0.0049'],
    ['1', '1.000051', '0.0051'],
  ])('open %s -> close %s is %s%%', (open, close, expected) => {
    expect(percent.computeChangePercent({ open, close })).toBe(expected);
  });

  test('rounds half away from zero, symmetrically', () => {
    expect(percent.computeChangePercent({ open: '1', close: '1.0000005' })).toBe('0.0001');
    expect(percent.computeChangePercent({ open: '1', close: '0.9999995' })).toBe('-0.0001');
    expect(percent.computeChangePercent({ open: '1', close: '1.00000049' })).toBe('0.0000');
    expect(percent.computeChangePercent({ open: '1', close: '0.99999951' })).toBe('0.0000');
  });

  test('a zero open price has no percentage', () => {
    expect(percent.computeChangePercent({ open: '0', close: '10' })).toBeUndefined();
    expect(percent.computeChangePercent({ open: '0.00000000', close: '10' })).toBeUndefined();
  });

  test('text that is not a plain decimal has no percentage (the stream is third-party input)', () => {
    for (const bad of ['', 'abc', '1e5', '-', '1.2.3', ' 1']) {
      expect(percent.computeChangePercent({ open: bad, close: '1' })).toBeUndefined();
      expect(percent.computeChangePercent({ open: '1', close: bad })).toBeUndefined();
    }
  });

  test('keeps full precision where a float would not', () => {
    expect(percent.computeChangePercent({ open: '0.30000000', close: '0.30003000' })).toBe(
      '0.0100',
    );
    expect(
      percent.computeChangePercent({ open: '123456789.12345678', close: '246913578.24691356' }),
    ).toBe('100.0000');
  });
});
