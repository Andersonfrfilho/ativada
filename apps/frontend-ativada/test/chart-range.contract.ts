// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  applyDateField,
  availableShortcuts,
  canShift,
  clampRange,
  DAY_MILLISECONDS,
  formatRangeParam,
  parseDateField,
  parseRangeParam,
  rangeForShortcut,
  RANGE_SHORTCUTS,
  shiftRange,
  toDateFieldValue,
} from '../src/runs/chart-range.js';

const START = Date.parse('2026-04-01T00:00:00.000Z');
const EXTENT = { from: START, to: START + 40 * DAY_MILLISECONDS };

function labels(extent: { from: number; to: number } | undefined): string[] {
  return availableShortcuts(extent).map((shortcut) => shortcut.label);
}

function shortcut(key: string): (typeof RANGE_SHORTCUTS)[number] {
  const found = RANGE_SHORTCUTS.find((item) => item.key === key);
  if (found === undefined) throw new Error(key);
  return found;
}

describe('availableShortcuts', () => {
  test('a 40-day run offers everything', () => {
    expect(labels(EXTENT)).toEqual(['Tudo', '30 dias', '7 dias', '1 dia']);
  });

  test('a shortcut longer than the run disappears; the same size stays', () => {
    expect(labels({ from: START, to: START + 10 * DAY_MILLISECONDS })).toEqual([
      'Tudo',
      '7 dias',
      '1 dia',
    ]);
    expect(labels({ from: START, to: START + 7 * DAY_MILLISECONDS })).toContain('7 dias');
    expect(labels({ from: START, to: START + DAY_MILLISECONDS / 2 })).toEqual(['Tudo']);
  });

  test('without a known period only "Tudo" is offered', () => {
    expect(labels(undefined)).toEqual(['Tudo']);
  });
});

describe('rangeForShortcut', () => {
  test('is the last N milliseconds of the period; "Tudo" has no range', () => {
    expect(rangeForShortcut(EXTENT, shortcut('7d'))).toEqual({
      from: EXTENT.to - 7 * DAY_MILLISECONDS,
      to: EXTENT.to,
    });
    expect(rangeForShortcut(EXTENT, shortcut('all'))).toBeUndefined();
  });

  test('durations are in milliseconds, so a day is always 24 hours', () => {
    expect(shortcut('1d').milliseconds).toBe(86_400_000);
  });
});

describe('shiftRange', () => {
  const range = { from: START + 10 * DAY_MILLISECONDS, to: START + 17 * DAY_MILLISECONDS };

  test('moves by its own size in either direction', () => {
    expect(shiftRange({ range, extent: EXTENT, direction: 1 })).toEqual({
      from: START + 17 * DAY_MILLISECONDS,
      to: START + 24 * DAY_MILLISECONDS,
    });
    expect(shiftRange({ range, extent: EXTENT, direction: -1 })).toEqual({
      from: START + 3 * DAY_MILLISECONDS,
      to: START + 10 * DAY_MILLISECONDS,
    });
  });

  test('stops at the edges of the period without shrinking the window', () => {
    const early = { from: START + 3 * DAY_MILLISECONDS, to: START + 10 * DAY_MILLISECONDS };
    expect(shiftRange({ range: early, extent: EXTENT, direction: -1 }).from).toBe(START);
    const late = { from: EXTENT.to - 5 * DAY_MILLISECONDS, to: EXTENT.to - DAY_MILLISECONDS };
    const moved = shiftRange({ range: late, extent: EXTENT, direction: 1 });
    expect(moved.to).toBe(EXTENT.to);
    expect(moved.to - moved.from).toBe(4 * DAY_MILLISECONDS);
  });

  test('canShift is false exactly at the edge', () => {
    expect(canShift({ range, extent: EXTENT, direction: 1 })).toBe(true);
    const atStart = { from: START, to: START + 7 * DAY_MILLISECONDS };
    expect(canShift({ range: atStart, extent: EXTENT, direction: -1 })).toBe(false);
    const atEnd = { from: EXTENT.to - 7 * DAY_MILLISECONDS, to: EXTENT.to };
    expect(canShift({ range: atEnd, extent: EXTENT, direction: 1 })).toBe(false);
    expect(canShift({ range: atEnd, extent: EXTENT, direction: -1 })).toBe(true);
  });
});

describe('URL parameters', () => {
  test('accept milliseconds and ISO, ignore the rest', () => {
    expect(parseRangeParam('1775001600000')).toBe(1_775_001_600_000);
    expect(parseRangeParam('2026-04-01T00:00:00.000Z')).toBe(START);
    expect(parseRangeParam('2026-04-01')).toBe(START);
    expect(parseRangeParam('amanhã')).toBeUndefined();
    expect(parseRangeParam('')).toBeUndefined();
    expect(parseRangeParam(null)).toBeUndefined();
    expect(parseRangeParam('99999999999999999999')).toBeUndefined();
  });

  test('written as UTC ISO and read back to the same instant', () => {
    expect(formatRangeParam(START)).toBe('2026-04-01T00:00:00.000Z');
    expect(parseRangeParam(formatRangeParam(START + 12_345))).toBe(START + 12_345);
  });
});

describe('date fields', () => {
  test('show the UTC day and read it back as the start of that day', () => {
    expect(toDateFieldValue(START + 5_000)).toBe('2026-04-01');
    expect(parseDateField('2026-04-10')).toBe(START + 9 * DAY_MILLISECONDS);
    expect(parseDateField('10/04/2026')).toBeUndefined();
    expect(parseDateField('')).toBeUndefined();
  });

  test('"De" is the start of the day and "Até" includes the whole day', () => {
    const shown = { from: START, to: START + 10 * DAY_MILLISECONDS };
    expect(applyDateField(shown, 'from', '2026-04-04')).toEqual({
      from: START + 3 * DAY_MILLISECONDS,
      to: shown.to,
    });
    expect(applyDateField(shown, 'to', '2026-04-05')).toEqual({
      from: START,
      to: START + 5 * DAY_MILLISECONDS,
    });
  });

  test('an end before the start is refused', () => {
    const shown = { from: START + 5 * DAY_MILLISECONDS, to: START + 10 * DAY_MILLISECONDS };
    expect(applyDateField(shown, 'to', '2026-04-02')).toBeUndefined();
    expect(applyDateField(shown, 'from', '2026-05-01')).toBeUndefined();
    expect(applyDateField(shown, 'from', 'lixo')).toBeUndefined();
  });

  test('clampRange keeps the range inside the run, or says there is none', () => {
    expect(clampRange({ from: START - 100, to: START + 100 }, EXTENT)).toEqual({
      from: START,
      to: START + 100,
    });
    expect(clampRange({ from: EXTENT.to + 1, to: EXTENT.to + 9 }, EXTENT)).toBeUndefined();
  });
});
