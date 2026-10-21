// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { formatFeeShare, formatRate, rateTone } from '../src/horizons/horizon-format.js';

describe('rate formatting follows the server sentence (floor for gains, ceiling for fee share)', () => {
  test('a gain is cut down, never rounded up', () => {
    expect(formatRate('0.0046', true)).toBe('+0,4%');
    expect(formatRate('0.5499', true)).toBe('+54,9%');
    expect(formatRate('0.54773869', false)).toBe('54,7%');
    expect(formatRate('0.58', false)).toBe('58,0%');
  });

  test('a loss is cut further from zero', () => {
    expect(formatRate('-0.0041', true)).toBe('-0,5%');
    expect(formatRate('-0.07', true)).toBe('-7,0%');
    expect(formatRate('-0.00001', true)).toBe('-0,1%');
  });

  test('a gain that floors to zero has no sign and no tone', () => {
    expect(formatRate('0.0004', true)).toBe('0,0%');
    expect(rateTone('0.0004')).toBeUndefined();
    expect(rateTone('0.0046')).toBe('positive');
    expect(rateTone('-0.0004')).toBe('negative');
    expect(rateTone(null)).toBeUndefined();
  });

  test('fee share rounds up, against the user', () => {
    expect(formatFeeShare('0.4501')).toBe('45,1%');
    expect(formatFeeShare('0.45')).toBe('45,0%');
    expect(formatFeeShare('0.0001')).toBe('0,1%');
    expect(formatFeeShare(null)).toBe('—');
  });

  test('missing or malformed rate is a dash', () => {
    expect(formatRate(null, true)).toBe('—');
    expect(formatRate('NaN', true)).toBe('—');
  });
});
