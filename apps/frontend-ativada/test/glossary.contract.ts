// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { GLOSSARY, GLOSSARY_TERM } from '../src/glossary/glossary.constant.js';

const ENTRIES = Object.values(GLOSSARY);

describe('glossary', () => {
  test('has one entry for each term of the spec (RF13)', () => {
    const terms: string[] = Object.values(GLOSSARY_TERM);
    expect(terms.sort()).toEqual(Object.keys(GLOSSARY).sort());
    expect(ENTRIES.map((entry) => entry.label).sort()).toEqual(
      ['Fator de lucro', 'Maior queda', 'Slippage', 'Sharpe', 'Sortino', 'Taxa de acerto'].sort(),
    );
  });

  test('every phrase is one line of plain text that ends with a period', () => {
    for (const entry of ENTRIES) {
      expect(entry.phrase.trim()).toBe(entry.phrase);
      expect(entry.phrase).not.toMatch(/[\r\n]/);
      expect(entry.phrase.endsWith('.')).toBe(true);
      expect(entry.phrase.length).toBeGreaterThan(20);
      expect(entry.phrase.length).toBeLessThanOrEqual(120);
    }
  });

  test('no phrase and no label repeats', () => {
    expect(new Set(ENTRIES.map((entry) => entry.phrase)).size).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((entry) => entry.label)).size).toBe(ENTRIES.length);
  });

  test('the phrases are the ones the spec fixed', () => {
    expect(GLOSSARY[GLOSSARY_TERM.SORTINO].phrase).toBe(
      'Igual ao Sharpe, mas só conta as quedas como risco.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.WIN_RATE].phrase).toBe(
      'De cada 100 operações, quantas terminaram no lucro.',
    );
  });
});
