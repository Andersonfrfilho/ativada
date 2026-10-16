// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { ProjectionSummary } from '../src/runs/candle-chart/projections.validation.js';
import {
  buildMeasuredRow,
  buildUnmeasuredRow,
  hasCrown,
  rankRows,
  type RankingRow,
} from '../src/runs/team-room/balcony/ranking-model.js';
import { buildProjectionsSummary } from './support/candle-chart-fixtures.js';

function summaryWith(overrides: Record<string, unknown>): ProjectionSummary {
  return { ...buildProjectionsSummary(), ...overrides } as ProjectionSummary;
}

describe('ranking da lousa (escritório E-RF16, só com o que o servidor mede)', () => {
  test('the measured row carries hits of counted, the rate against 50% and the Wilson worst and best case', () => {
    const row = buildMeasuredRow(
      summaryWith({
        hits: 1420,
        counted: 2552,
        hitRate: '0.5564',
        wilson: { lower: '0.5369', upper: '0.5757' },
        verdict: 'above',
      }),
    );
    expect(row.hitsText).toBe('1.420 de 2.552');
    expect(row.rateText).toBe('55,64%');
    expect(row.intervalText).toBe('53,69% a 57,57%');
    expect(hasCrown(row)).toBe(true);
  });

  test('the crown goes only to "Acima da moeda ao ar"', () => {
    for (const verdict of ['even', 'below', 'too_few'] as const) {
      expect(hasCrown(buildMeasuredRow(summaryWith({ verdict })))).toBe(false);
    }
  });

  test('few predictions show no rate and no interval, and the row stays out of the ranking', () => {
    const row = buildMeasuredRow(summaryWith({ verdict: 'too_few', wilson: null, hitRate: null }));
    expect([row.rateText, row.intervalText]).toEqual(['—', '—']);
    expect(rankRows([row]).ranked).toEqual([]);
  });

  test('order is by the Wilson lower bound, never by the raw hit rate', () => {
    const lucky: RankingRow = { ...buildUnmeasuredRow('Sorte', '—'), lowerBound: 52_000_000n };
    const steady: RankingRow = { ...buildUnmeasuredRow('Firme', '—'), lowerBound: 53_700_000n };
    const { ranked, unranked } = rankRows([
      lucky,
      buildUnmeasuredRow('Sem medida', 'peso 1'),
      steady,
    ]);
    expect(ranked.map((row) => row.name)).toEqual(['Firme', 'Sorte']);
    expect(unranked.map((row) => row.name)).toEqual(['Sem medida']);
  });
});
