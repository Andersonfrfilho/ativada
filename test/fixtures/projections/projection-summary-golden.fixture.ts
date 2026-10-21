// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OracleSummary } from './projection-summary-oracle.fixture.js';

// Resultado da regra `projection-1` nos dois conjuntos reais do motor (gravado na T0.1 da spec 009). Mudar a regra
// exige `projection-2` e este dourado regravado; a consulta SQL da T1.2 tem de devolver os mesmos números.
export type ProjectionGoldenKey =
  | 'btcusdt-1h-500:classic'
  | 'btcusdt-1h-500:donchian-macd'
  | 'ethusdt-1d-400:classic'
  | 'ethusdt-1d-400:donchian-macd';

export const PROJECTION_SUMMARY_GOLDEN: Readonly<Record<ProjectionGoldenKey, OracleSummary>> = {
  'btcusdt-1h-500:classic': {
    predictions: 307,
    noSide: 21,
    pending: 1,
    hits: 134,
    misses: 151,
    ties: 0,
    upMoves: 153,
    banded: 285,
    inside: 246,
    byStrength: {
      weak: { counted: 116, hits: 57 },
      strong: { counted: 0, hits: 0 },
      decided: { counted: 169, hits: 77 },
    },
    counted: 285,
    hitRate: '0.4701',
    upRate: '0.5368',
    insideRate: '0.8631',
    verdict: 'even',
  },
  'btcusdt-1h-500:donchian-macd': {
    predictions: 372,
    noSide: 1,
    pending: 1,
    hits: 180,
    misses: 190,
    ties: 0,
    upMoves: 190,
    banded: 370,
    inside: 321,
    byStrength: {
      weak: { counted: 332, hits: 163 },
      strong: { counted: 0, hits: 0 },
      decided: { counted: 38, hits: 17 },
    },
    counted: 370,
    hitRate: '0.4864',
    upRate: '0.5135',
    insideRate: '0.8675',
    verdict: 'even',
  },
  'ethusdt-1d-400:classic': {
    predictions: 207,
    noSide: 14,
    pending: 1,
    hits: 84,
    misses: 108,
    ties: 0,
    upMoves: 98,
    banded: 192,
    inside: 168,
    byStrength: {
      weak: { counted: 66, hits: 30 },
      strong: { counted: 0, hits: 0 },
      decided: { counted: 126, hits: 54 },
    },
    counted: 192,
    hitRate: '0.4375',
    upRate: '0.5104',
    insideRate: '0.875',
    verdict: 'even',
  },
  'ethusdt-1d-400:donchian-macd': {
    predictions: 272,
    noSide: 0,
    pending: 1,
    hits: 123,
    misses: 148,
    ties: 0,
    upMoves: 140,
    banded: 271,
    inside: 237,
    byStrength: {
      weak: { counted: 245, hits: 112 },
      strong: { counted: 0, hits: 0 },
      decided: { counted: 26, hits: 11 },
    },
    counted: 271,
    hitRate: '0.4538',
    upRate: '0.5166',
    insideRate: '0.8745',
    verdict: 'even',
  },
};
