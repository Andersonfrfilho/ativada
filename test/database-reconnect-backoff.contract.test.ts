// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseConnectionApi } from './fixtures/database-connection/database-connection-source.fixture.js';

const { backoff: backoffModule } = await loadDatabaseConnectionApi();
const { computeBackoff } = backoffModule;

const BASE = 1_000;
const MAX = 30_000;

function backoff(attempt: number, random: number): number {
  return computeBackoff({ attempt, baseMilliseconds: BASE, maxMilliseconds: MAX, random });
}

describe('computeBackoff by hand (1 s to 30 s, draw in [c/2, c])', () => {
  test.each([
    { attempt: 1, low: 500, middle: 750, high: 1_000 },
    { attempt: 2, low: 1_000, middle: 1_500, high: 2_000 },
    { attempt: 3, low: 2_000, middle: 3_000, high: 4_000 },
    { attempt: 4, low: 4_000, middle: 6_000, high: 8_000 },
    { attempt: 5, low: 8_000, middle: 12_000, high: 16_000 },
    { attempt: 6, low: 15_000, middle: 22_500, high: 30_000 },
    { attempt: 7, low: 15_000, middle: 22_500, high: 30_000 },
  ])('attempt $attempt', ({ attempt, low, middle, high }) => {
    expect(backoff(attempt, 0)).toBe(low);
    expect(backoff(attempt, 0.5)).toBe(middle);
    expect(backoff(attempt, 1)).toBe(high);
  });

  test('an attempt below 1 behaves as the first', () => {
    expect(backoff(0, 1)).toBe(1_000);
    expect(backoff(-3, 0)).toBe(500);
  });

  test('a draw outside [0, 1] is clamped', () => {
    expect(backoff(1, 7)).toBe(1_000);
    expect(backoff(1, -7)).toBe(500);
  });
});

function createSeededDraw(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe('computeBackoff properties', () => {
  test('never above the ceiling, never below half of the step, for any attempt', () => {
    const draw = createSeededDraw(42);
    for (let attempt = 1; attempt <= 2_000; attempt += 1) {
      const step = Math.min(BASE * 2 ** Math.min(attempt - 1, 40), MAX);
      const delay = backoff(attempt, draw());
      expect(delay).toBeLessThanOrEqual(MAX);
      expect(delay).toBeLessThanOrEqual(step);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(step / 2));
    }
  });

  test('the highest draw never shrinks as the attempt grows', () => {
    let previous = 0;
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const delay = backoff(attempt, 1);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
    expect(previous).toBe(MAX);
  });

  test('always returns a positive integer wait', () => {
    const draw = createSeededDraw(7);
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const delay = backoff(attempt, draw());
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
    }
  });
});
