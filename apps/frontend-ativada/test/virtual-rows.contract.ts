// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeVisibleRows,
  ROW_HEIGHT,
  ROW_OVERSCAN,
  scrollTopToReveal,
  TABLE_VIEWPORT_HEIGHT,
} from '../src/runs/virtual-rows.js';

const BASE = { rowHeight: 40, viewportHeight: 400, overscan: 5 } as const;

// Gerador determinístico: o teste de propriedades repete igual em qualquer máquina.
function createSequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('computeVisibleRows: contas à mão', () => {
  test('at the top shows the window plus the margin below', () => {
    expect(computeVisibleRows({ ...BASE, scrollTop: 0, total: 1_000 })).toEqual({
      first: 0,
      end: 15,
      padTop: 0,
      padBottom: 985 * 40,
    });
  });

  test('in the middle keeps the margin on both sides', () => {
    // scrollTop 4.000 = linha 100 no topo; a janela vai da 100 à 110; com margem 95 a 115.
    expect(computeVisibleRows({ ...BASE, scrollTop: 4_000, total: 1_000 })).toEqual({
      first: 95,
      end: 115,
      padTop: 95 * 40,
      padBottom: 885 * 40,
    });
  });

  test('at the very end stops at the last row', () => {
    const result = computeVisibleRows({ ...BASE, scrollTop: 1_000_000, total: 1_000 });
    expect(result.end).toBe(1_000);
    expect(result.padBottom).toBe(0);
    expect(result.first).toBe(1_000 - 10 - 5);
  });

  test('no rows draws nothing', () => {
    expect(computeVisibleRows({ ...BASE, scrollTop: 0, total: 0 })).toEqual({
      first: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  test('fewer rows than the window draws them all with no spacer', () => {
    expect(computeVisibleRows({ ...BASE, scrollTop: 0, total: 4 })).toEqual({
      first: 0,
      end: 4,
      padTop: 0,
      padBottom: 0,
    });
  });

  test('a negative or non-finite scroll is the top', () => {
    const top = computeVisibleRows({ ...BASE, scrollTop: 0, total: 100 });
    expect(computeVisibleRows({ ...BASE, scrollTop: -50, total: 100 })).toEqual(top);
    expect(computeVisibleRows({ ...BASE, scrollTop: Number.NaN, total: 100 })).toEqual(top);
  });
});

describe('computeVisibleRows: propriedades', () => {
  test('indices stay inside the limits, cover the window with no hole and the spacers add up to the full height', () => {
    const next = createSequence(7);
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const total = Math.floor(next() * 3_000);
      const rowHeight = 1 + Math.floor(next() * 80);
      const viewportHeight = 1 + Math.floor(next() * 800);
      const overscan = Math.floor(next() * 12);
      const scrollTop = (next() * 1.2 - 0.1) * total * rowHeight;
      const rows = computeVisibleRows({ rowHeight, viewportHeight, scrollTop, total, overscan });
      expect(rows.first).toBeGreaterThanOrEqual(0);
      expect(rows.end).toBeLessThanOrEqual(total);
      expect(rows.first).toBeLessThanOrEqual(rows.end);
      expect(rows.padTop + (rows.end - rows.first) * rowHeight + rows.padBottom).toBe(
        total * rowHeight,
      );
      if (total === 0) continue;
      const clamped = Math.min(
        Math.max(scrollTop, 0),
        Math.max(0, total * rowHeight - viewportHeight),
      );
      const firstSeen = Math.floor(clamped / rowHeight);
      const lastSeen = Math.min(total, Math.ceil((clamped + viewportHeight) / rowHeight)) - 1;
      expect(rows.first).toBeLessThanOrEqual(firstSeen);
      expect(rows.end - 1).toBeGreaterThanOrEqual(lastSeen);
    }
  });

  test('the real window never draws more than the budget of the table', () => {
    for (let total = 0; total <= 5_000; total += 137) {
      for (let scrollTop = 0; scrollTop <= total * ROW_HEIGHT; scrollTop += 977) {
        const rows = computeVisibleRows({
          rowHeight: ROW_HEIGHT,
          viewportHeight: TABLE_VIEWPORT_HEIGHT,
          scrollTop,
          total,
          overscan: ROW_OVERSCAN,
        });
        expect(rows.end - rows.first).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('scrollTopToReveal', () => {
  const params = { rowHeight: 40, viewportHeight: 400 } as const;

  test('a row comfortably in view does not scroll', () => {
    expect(scrollTopToReveal({ ...params, index: 5, scrollTop: 0 })).toBeUndefined();
  });

  test('a row far below or above is centered in the window', () => {
    expect(scrollTopToReveal({ ...params, index: 100, scrollTop: 0 })).toBe(4_000 - 180);
    expect(scrollTopToReveal({ ...params, index: 100, scrollTop: 9_000 })).toBe(4_000 - 180);
  });

  test('the first rows never ask for a negative scroll', () => {
    expect(scrollTopToReveal({ ...params, index: 0, scrollTop: 800 })).toBe(0);
  });

  test('a row on the edge of the window is brought in', () => {
    expect(scrollTopToReveal({ ...params, index: 9, scrollTop: 0 })).toBe(360 - 180);
  });
});
