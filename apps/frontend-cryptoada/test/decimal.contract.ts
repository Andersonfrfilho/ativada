// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  divideFloor,
  formatDecimalText,
  multiplyDown,
  multiplyUp,
  parseScaled,
  roundScaledHalfUp,
  toPlainText,
} from '../src/format/decimal.js';

describe('scaled decimal parsing', () => {
  test('keeps 8 places exactly and truncates the rest toward zero', () => {
    expect(parseScaled('62000.5')).toBe(6_200_050_000_000n);
    expect(parseScaled('0.123456789')).toBe(12_345_678n);
    expect(parseScaled('-1.5')).toBe(-150_000_000n);
    expect(parseScaled('7')).toBe(700_000_000n);
  });

  test('refuses what is not a plain decimal', () => {
    for (const bad of ['', 'abc', '1e5', '1,5', ' 1', '1.', '.5', 'NaN']) {
      expect(parseScaled(bad)).toBeUndefined();
    }
  });

  test('prints back with 8 places', () => {
    expect(toPlainText(parseScaled('3000.5') ?? 0n)).toBe('3000.50000000');
    expect(toPlainText(-1n)).toBe('-0.00000001');
  });
});

describe('scaled arithmetic', () => {
  const quantity = parseScaled('0.12345678') ?? 0n;
  const price = parseScaled('0.12345678') ?? 0n;

  test('a product rounds DOWN for the value and UP for the cost, as the server does', () => {
    expect(toPlainText(multiplyDown(quantity, price))).toBe('0.01524157');
    expect(toPlainText(multiplyUp(quantity, price))).toBe('0.01524158');
  });

  test('an exact product is the same either way', () => {
    const exact = multiplyDown(parseScaled('0.5') ?? 0n, parseScaled('62000') ?? 0n);
    expect(toPlainText(exact)).toBe('31000.00000000');
    expect(multiplyUp(parseScaled('0.5') ?? 0n, parseScaled('62000') ?? 0n)).toBe(exact);
  });

  test('a quotient floors toward minus infinity (a loss rate is never rounded up to look smaller)', () => {
    expect(toPlainText(divideFloor(100_000_000n, 300_000_000n) ?? 0n)).toBe('0.33333333');
    expect(toPlainText(divideFloor(-100_000_000n, 300_000_000n) ?? 0n)).toBe('-0.33333334');
    expect(divideFloor(1n, 0n)).toBeUndefined();
  });

  test('rounds half up to the cents', () => {
    expect(toPlainText(roundScaledHalfUp(parseScaled('2.005') ?? 0n, 2))).toBe('2.01000000');
    expect(toPlainText(roundScaledHalfUp(parseScaled('-2.005') ?? 0n, 2))).toBe('-2.01000000');
    expect(toPlainText(roundScaledHalfUp(parseScaled('2.004') ?? 0n, 2))).toBe('2.00000000');
  });
});

describe('exact pt-BR formatting', () => {
  const cases: readonly (readonly [string, number, number, string])[] = [
    ['1234567.891', 2, 2, '1.234.567,89'],
    ['2.005', 2, 2, '2,01'],
    ['-2.005', 2, 2, '-2,01'],
    ['62000', 2, 8, '62.000,00'],
    ['3000.5', 2, 8, '3.000,50'],
    ['0.00001234', 2, 8, '0,00001234'],
    ['0.123456789', 2, 8, '0,12345679'],
    ['0.5', 0, 8, '0,5'],
    ['0', 2, 2, '0,00'],
    ['9007199254740993.01', 2, 2, '9.007.199.254.740.993,01'],
  ];
  for (const [text, minimum, maximum, expected] of cases) {
    test(`${text} (${minimum}-${maximum} places) becomes ${expected}`, () => {
      expect(formatDecimalText(text, { minimumFraction: minimum, maximumFraction: maximum })).toBe(
        expected,
      );
    });
  }
});
