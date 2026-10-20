// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeVariationHundredths,
  computeVariations,
  describeVariation,
  formatVariation,
  VARIATION_REASON,
  VARIATION_WINDOWS,
  type ComputeVariationsParams,
  type VariationCandle,
} from '../src/live/price-variation.js';

const MINUTE = 60_000;
const NOW = 10_000_000_000;

function byKey(
  variations: ReturnType<typeof computeVariations>,
  key: string,
): ReturnType<typeof computeVariations>[number] {
  const found = variations.find((variation) => variation.window.key === key);
  if (found === undefined) throw new Error(`janela ${key} ausente`);
  return found;
}

describe('variation math', () => {
  test('truncates toward zero at two decimals in both directions', () => {
    expect(computeVariationHundredths('100.129', '100')).toBe(12n);
    expect(computeVariationHundredths('99.871', '100')).toBe(-12n);
    expect(computeVariationHundredths('100.004', '100')).toBe(0n);
    expect(computeVariationHundredths('99.996', '100')).toBe(0n);
  });

  test('refuses a zero, negative or malformed reference', () => {
    expect(computeVariationHundredths('1', '0')).toBeUndefined();
    expect(computeVariationHundredths('1', 'abc')).toBeUndefined();
  });

  test('formats with explicit sign, pt-BR comma, and no sign on an exact zero', () => {
    expect(formatVariation(12n)).toBe('+0,12%');
    expect(formatVariation(-150n)).toBe('−1,50%');
    expect(formatVariation(123_456n)).toBe('+1.234,56%');
    expect(formatVariation(0n)).toBe('0,00%');
  });

  test('describes in words, with and without data', () => {
    const window = VARIATION_WINDOWS[0];
    const base = { window, reason: 'x' };
    expect(describeVariation({ ...base, hundredths: 12n })).toBe('subiu 0,12% em 1 minuto');
    expect(describeVariation({ ...base, hundredths: -12n })).toBe('caiu 0,12% em 1 minuto');
    expect(describeVariation({ ...base, hundredths: 0n })).toBe('não variou em 1 minuto');
    expect(describeVariation({ ...base, hundredths: undefined })).toContain('indisponível');
  });
});

function candlesEvery15(count: number, closeOf: (index: number) => string): VariationCandle[] {
  // A última vela fechou há 5 min; as outras, de 15 em 15 min para trás.
  return Array.from({ length: count }, (_, index) => ({
    closeTime: NOW - 5 * MINUTE - (count - 1 - index) * 15 * MINUTE,
    close: closeOf(index),
  }));
}

function params(overrides: Partial<ComputeVariationsParams>): ComputeVariationsParams {
  return {
    now: NOW,
    livePrice: '105',
    tickAtOrBefore: () => undefined,
    candles: [],
    ...overrides,
  };
}

describe('computeVariations', () => {
  test('uses ticks for the short windows when the history spans them', () => {
    const variations = computeVariations(
      params({
        tickAtOrBefore: (limit) => ({ time: limit - 1_000, price: '100' }),
      }),
    );
    expect(byKey(variations, '1m').hundredths).toBe(500n);
    expect(byKey(variations, '15m').hundredths).toBe(500n);
  });

  test('a short history leaves 1 min empty with the reason, never zero', () => {
    const variation = byKey(computeVariations(params({})), '1m');
    expect(variation.hundredths).toBeUndefined();
    expect(variation.reason).toBe(VARIATION_REASON.SHORT_HISTORY);
  });

  test('longer windows come from the candle closest to now minus the window', () => {
    const candles = candlesEvery15(100, () => '100');
    const variations = computeVariations(params({ candles }));
    expect(byKey(variations, '1h').hundredths).toBe(500n);
    expect(byKey(variations, '4h').hundredths).toBe(500n);
    expect(byKey(variations, '24h').hundredths).toBe(500n);
  });

  test('a window beyond the stored candles is empty', () => {
    const variations = computeVariations(params({ candles: candlesEvery15(6, () => '100') }));
    expect(byKey(variations, '1h').hundredths).toBe(500n);
    expect(byKey(variations, '24h').hundredths).toBeUndefined();
    expect(byKey(variations, '24h').reason).toBe(VARIATION_REASON.NO_CANDLES);
  });

  test('without a fresh live price it anchors on the last candle close and skips tick windows', () => {
    const candles = candlesEvery15(10, (index) => String(100 + index));
    const variations = computeVariations(params({ livePrice: undefined, candles }));
    // última vela 109, uma hora antes (4 velas atrás) 105: +3,80%
    expect(byKey(variations, '1h').hundredths).toBe(380n);
    expect(byKey(variations, '1m').reason).toBe(VARIATION_REASON.NO_LIVE_PRICE);
  });
});
