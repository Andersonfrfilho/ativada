// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  formatAxisPrice,
  formatAxisScore,
  formatAxisVolume,
  pricePrecisionFor,
  pricePriceFormat,
} from '../src/runs/candle-chart/surface-format.js';

describe('axis price format', () => {
  test('uses the pt-BR thousands separator and decimal comma', () => {
    expect(formatAxisPrice(61700, 2)).toBe('61.700,00');
    expect(formatAxisPrice(12.562, 3)).toBe('12,562');
    expect(formatAxisPrice(0.00000812, 8)).toBe('0,00000812');
  });

  test('negative prices and scores use the true minus sign, never the hyphen', () => {
    expect(formatAxisPrice(-1.5, 2)).toBe('−1,50');
    expect(formatAxisScore(-2)).toBe('−2');
    expect(formatAxisScore(2)).toBe('2');
    expect(formatAxisScore(0)).toBe('0');
    expect(formatAxisScore(-0.5)).toBe('−0,5');
    expect(formatAxisPrice(-1.5, 2)).not.toContain('-');
  });

  test('volume is compact with the pt-BR words', () => {
    expect(formatAxisVolume(37300).replace(' ', ' ')).toBe('37,3 mil');
    expect(formatAxisVolume(10)).toBe('10');
  });

  test('the precision follows the magnitude of the price like the exchange does', () => {
    expect(pricePrecisionFor(61700)).toBe(2);
    expect(pricePrecisionFor(12.562)).toBe(3);
    expect(pricePrecisionFor(2.5)).toBe(4);
    expect(pricePrecisionFor(0.25)).toBe(5);
    expect(pricePrecisionFor(0.0000081)).toBe(8);
    expect(pricePrecisionFor(0)).toBe(2);
    expect(pricePrecisionFor(Number.NaN)).toBe(2);
  });

  test('the library format carries the formatter and a move that matches the precision', () => {
    const format = pricePriceFormat(3);
    expect(format.type).toBe('custom');
    expect(format.minMove).toBeCloseTo(0.001, 10);
    expect(format.formatter(12562.5)).toBe('12.562,500');
  });
});
