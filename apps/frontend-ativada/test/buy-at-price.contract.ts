// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { parseBuyAtPrice } from '../src/runs/trading-room/buy-at-price.js';

describe('o preço de "E se eu comprar a…"', () => {
  test('accepts the Brazilian and the dotted spelling, as text with a decimal point', () => {
    expect(parseBuyAtPrice('61.000,50')).toBe('61000.50');
    expect(parseBuyAtPrice(' 61000.5 ')).toBe('61000.5');
    expect(parseBuyAtPrice('0,00001234')).toBe('0.00001234');
    expect(parseBuyAtPrice('100')).toBe('100');
  });

  test('refuses zero, negatives, words and more than 8 decimals', () => {
    for (const input of ['', '0', '0,0', '-5', 'abc', '1,123456789', '1.2.3']) {
      expect(parseBuyAtPrice(input)).toBeUndefined();
    }
  });
});
