// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { buildPriceRangeSection } from '../apps/api-ativada/src/runs/live-status/live-price-range.js';

describe('faixa de preço do acompanhamento', () => {
  test('without a closed candle in the period the section is null, never zero', () => {
    expect(buildPriceRangeSection(undefined)).toBeNull();
    expect(
      buildPriceRangeSection({
        period: { low: null, high: null, from: 1 },
        total: { low: '1', high: '2', from: 0 },
        periods: 2,
      }),
    ).toBeNull();
  });

  test('a single period trims the database zeros and speaks only of the period', () => {
    const view = buildPriceRangeSection({
      period: { low: '100.74000000', high: '103.69000000', from: 10 },
      total: { low: '100.74000000', high: '103.69000000', from: 10 },
      periods: 1,
    });
    expect(view).toEqual({
      period: { low: '100.74', high: '103.69', from: 10 },
      total: { low: '100.74', high: '103.69', from: 10 },
      periods: 1,
      message: 'Neste período a moeda foi de 100,74 a 103,69.',
    });
  });

  test('a renewed sequence adds the range since the first period', () => {
    const view = buildPriceRangeSection({
      period: { low: '100.74', high: '103.69', from: 10 },
      total: { low: '98.62', high: '1109.2', from: 1 },
      periods: 2,
    });
    expect(view?.message).toBe(
      'Neste período a moeda foi de 100,74 a 103,69. Nos 2 períodos, de 98,62 a 1.109,20.',
    );
  });
});
