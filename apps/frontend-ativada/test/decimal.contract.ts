// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  divideFloor,
  formatDecimalText,
  formatSignedPercentDown,
  multiplyDown,
  multiplyUp,
  parseScaled,
  roundRateDownToPercent,
  roundScaledDirected,
  roundScaledHalfUp,
  toPlainText,
} from '../src/format/decimal.js';
import { formatPrice } from '../src/format/format.js';

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

  test('rounds toward plus or minus infinity to the cents, never moving an exact value', () => {
    const round = (text: string, direction: 'up' | 'down'): string =>
      toPlainText(roundScaledDirected(parseScaled(text) ?? 0n, 2, direction));
    expect(round('202.2975', 'up')).toBe('202.30000000');
    expect(round('202.2975', 'down')).toBe('202.29000000');
    expect(round('-8789.251', 'down')).toBe('-8789.26000000');
    expect(round('-8789.251', 'up')).toBe('-8789.25000000');
    expect(round('1.10', 'up')).toBe('1.10000000');
    expect(round('1.10', 'down')).toBe('1.10000000');
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

describe('price formatting by magnitude', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['66099.11562388', '66.099,12'],
    ['62000', '62.000,00'],
    ['12.34567', '12,3457'],
    ['3.5', '3,50'],
    ['0.00001234', '0,00001234'],
    ['0.5', '0,50'],
    ['-0.00001234', '-0,00001234'],
  ];
  for (const [text, expected] of cases) {
    test(`${text} shows as ${expected}`, () => {
      expect(formatPrice(text)).toBe(expected);
    });
  }
});

describe('the rate as a percent rounded down', () => {
  test('a gain never rounds up and a loss never rounds toward zero', () => {
    expect(roundRateDownToPercent(parseScaled('0.00009') ?? 0n)).toBe(0n);
    expect(formatSignedPercentDown(parseScaled('0.00009') ?? 0n)).toBe('0,00%');
    expect(formatSignedPercentDown(parseScaled('0.00019') ?? 0n)).toBe('+0,01%');
    expect(formatSignedPercentDown(parseScaled('-0.000001') ?? 0n)).toBe('-0,01%');
    expect(formatSignedPercentDown(parseScaled('0.0333') ?? 0n)).toBe('+3,33%');
  });
});
