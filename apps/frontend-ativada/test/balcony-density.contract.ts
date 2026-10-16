// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  DENSITY,
  DENSITY_STORAGE_KEY,
  readChoice,
  resolveDensity,
} from '../src/runs/team-room/balcony/balcony-density.js';

function css(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('densidade da varanda por medida da janela', () => {
  test('automatic: comfortable from 800 px of height, compact from 640 px, collapsed below', () => {
    expect(resolveDensity('auto', 1080)).toBe(DENSITY.COMFORTABLE);
    expect(resolveDensity('auto', 800)).toBe(DENSITY.COMFORTABLE);
    expect(resolveDensity('auto', 768)).toBe(DENSITY.COMPACT);
    expect(resolveDensity('auto', 640)).toBe(DENSITY.COMPACT);
    expect(resolveDensity('auto', 600)).toBe(DENSITY.COLLAPSED);
  });

  test('the choice of the person wins, but a very short window still collapses the team', () => {
    expect(resolveDensity(DENSITY.COMPACT, 1080)).toBe(DENSITY.COMPACT);
    expect(resolveDensity(DENSITY.COMFORTABLE, 700)).toBe(DENSITY.COMFORTABLE);
    expect(resolveDensity(DENSITY.COMFORTABLE, 500)).toBe(DENSITY.COLLAPSED);
  });

  test('the stored choice survives, junk and denied storage fall back to automatic', () => {
    expect(readChoice({ getItem: () => 'compact' })).toBe('compact');
    expect(readChoice({ getItem: () => 'x' })).toBe('auto');
    expect(
      readChoice({
        getItem: () => {
          throw new Error('negado');
        },
      }),
    ).toBe('auto');
    expect(DENSITY_STORAGE_KEY).toBe('ativada.balcony-density');
  });

  test('the stylesheet keeps the density classes and the chart keeps at least 320 px', () => {
    const balcony = css('../src/runs/team-room/balcony/Balcony.module.css');
    expect(balcony).toContain("[data-density='compact']");
    expect(balcony).toContain("[data-density='collapsed']");
    const chart = css('../src/runs/candle-chart/CandleChart.module.css');
    expect(chart).toContain('clamp(320px, calc(100dvh - 440px), 640px)');
    expect(chart).toContain('clamp(320px, calc(100dvh - 330px), 640px)');
  });
});
