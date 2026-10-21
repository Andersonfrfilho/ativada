// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeOutcomeSegments, describeOutcomeBar } from '../src/goals/outcome-bar.js';

describe('outcome bar', () => {
  test('splits 100 attempts into reached, stopped and neither', () => {
    const segments = computeOutcomeSegments('0.15', '0.25');
    expect(segments.reached).toBeCloseTo(15);
    expect(segments.stopped).toBeCloseTo(25);
    expect(segments.neither).toBeCloseTo(60);
  });

  test('missing rates draw an all-neutral bar', () => {
    expect(computeOutcomeSegments(null, null)).toEqual({ reached: 0, stopped: 0, neither: 100 });
  });

  test('never overflows 100 even when the rates add up to more', () => {
    const segments = computeOutcomeSegments('0.7', '0.6');
    expect(segments.reached + segments.stopped + segments.neither).toBeCloseTo(100);
    expect(segments.neither).toBeGreaterThanOrEqual(0);
  });

  test('ignores garbage instead of drawing NaN', () => {
    expect(computeOutcomeSegments('abc', '-1')).toEqual({ reached: 0, stopped: 0, neither: 100 });
  });

  test('the spoken description sums to 100', () => {
    const text = describeOutcomeBar(computeOutcomeSegments('0.1528', '0.2358'));
    expect(text).toBe(
      'A cada 100 tentativas no passado: 15 chegaram ao alvo, 24 pararam na perda máxima e 61 terminaram sem chegar a nenhum dos dois.',
    );
  });
});
