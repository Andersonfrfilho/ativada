// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadStatistics } from './fixtures/projections/statistics-source.fixture.js';
import { verdictOf } from './fixtures/projections/projection-summary-oracle.fixture.js';

const { wilson } = await loadStatistics();
const {
  COIN_FLIP_MINIMUM_COUNTED,
  COIN_FLIP_VERDICT,
  computeWilsonInterval,
  judgeAgainstCoinFlip,
} = wilson;

// Contas à mão (z = 1,96): limite = (k + z²/2 ∓ z·√(k(n − k)/n + z²/4)) ÷ (n + z²), com z² = 3,8416.
describe('intervalo de Wilson de 95% (ADR 0002, spec 009, P5 e P10)', () => {
  test('21 de 30: inferior 0,5212 e superior 0,8333 (arredondados para fora na 12ª casa)', () => {
    const { lower, upper } = computeWilsonInterval({ successes: 21, total: 30 });
    expect(lower.startsWith('0.5212')).toBe(true);
    expect(upper.startsWith('0.8333')).toBe(true);
  });

  test('20 de 30: o inferior (0,4877) fica abaixo de 0,5', () => {
    const { lower } = computeWilsonInterval({ successes: 20, total: 30 });
    expect(lower.startsWith('0.4877')).toBe(true);
  });

  test('0 de n e n de n encostam no 0 e no 1 exatos', () => {
    expect(computeWilsonInterval({ successes: 0, total: 40 }).lower).toBe('0');
    expect(computeWilsonInterval({ successes: 40, total: 40 }).upper).toBe('1');
  });

  test('o intervalo tem até 12 casas e contém a proporção', () => {
    const { lower, upper } = computeWilsonInterval({ successes: 1, total: 3 });
    expect(lower).toMatch(/^0\.\d{1,12}$/);
    expect(upper).toMatch(/^0\.\d{1,12}$/);
    expect(Number(lower)).toBeLessThan(1 / 3);
    expect(Number(upper)).toBeGreaterThan(1 / 3);
  });

  test('contagem inválida é erro, nunca um intervalo inventado', () => {
    expect(() => computeWilsonInterval({ successes: 0, total: 0 })).toThrow(RangeError);
    expect(() => computeWilsonInterval({ successes: 5, total: 4 })).toThrow(RangeError);
    expect(() => computeWilsonInterval({ successes: -1, total: 4 })).toThrow(RangeError);
    expect(() => computeWilsonInterval({ successes: 1.5, total: 4 })).toThrow(RangeError);
  });

  test('inferior ≤ proporção ≤ superior em todas as contagens até 120', () => {
    for (let total = 1; total <= 120; total += 1) {
      for (let successes = 0; successes <= total; successes += 1) {
        const { lower, upper } = computeWilsonInterval({ successes, total });
        const proportion = successes / total;
        expect(Number(lower)).toBeLessThanOrEqual(proportion + 1e-12);
        expect(Number(upper)).toBeGreaterThanOrEqual(proportion - 1e-12);
      }
    }
  });
});

describe('veredito contra a moeda ao ar', () => {
  test('29 contadas: poucas, mesmo com 29 acertos; 30 de 30 já é acima', () => {
    expect(COIN_FLIP_MINIMUM_COUNTED).toBe(30);
    expect(judgeAgainstCoinFlip({ hits: 29, counted: 29 }).verdict).toBe(COIN_FLIP_VERDICT.TOO_FEW);
    expect(judgeAgainstCoinFlip({ hits: 30, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.ABOVE);
    expect(judgeAgainstCoinFlip({ hits: 0, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.BELOW);
  });

  test('o limite encostando em 0,5: 21 de 30 é o primeiro acima, 9 o primeiro abaixo', () => {
    expect(judgeAgainstCoinFlip({ hits: 20, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.EVEN);
    expect(judgeAgainstCoinFlip({ hits: 21, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.ABOVE);
    expect(judgeAgainstCoinFlip({ hits: 10, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.EVEN);
    expect(judgeAgainstCoinFlip({ hits: 9, counted: 30 }).verdict).toBe(COIN_FLIP_VERDICT.BELOW);
  });

  test('171 de 346 (49,42%) é igual à moeda ao ar', () => {
    const judgement = judgeAgainstCoinFlip({ hits: 171, counted: 346 });
    expect(judgement.verdict).toBe(COIN_FLIP_VERDICT.EVEN);
    expect(judgement.lower?.startsWith('0.441')).toBe(true);
    expect(judgement.upper?.startsWith('0.546')).toBe(true);
  });

  test('nenhuma contada: poucas e sem limites', () => {
    expect(judgeAgainstCoinFlip({ hits: 0, counted: 0 })).toStrictEqual({
      verdict: COIN_FLIP_VERDICT.TOO_FEW,
      lower: null,
      upper: null,
    });
  });

  test('o veredito é igual ao do oráculo bigint (independente) em todas as contagens até 400', () => {
    for (let counted = 0; counted <= 400; counted += 1) {
      for (let hits = 0; hits <= counted; hits += 1) {
        expect(judgeAgainstCoinFlip({ hits, counted }).verdict).toBe(verdictOf({ hits, counted }));
      }
    }
  });

  test('os limites exibidos concordam com o veredito em todas as contagens de 30 a 150', () => {
    for (let counted = COIN_FLIP_MINIMUM_COUNTED; counted <= 150; counted += 1) {
      for (let hits = 0; hits <= counted; hits += 1) {
        const { verdict, lower, upper } = judgeAgainstCoinFlip({ hits, counted });
        if (lower === null || upper === null) throw new Error('limites ausentes');
        if (verdict === COIN_FLIP_VERDICT.ABOVE) expect(Number(lower)).toBeGreaterThanOrEqual(0.5);
        if (verdict === COIN_FLIP_VERDICT.BELOW) expect(Number(upper)).toBeLessThanOrEqual(0.5);
        if (verdict === COIN_FLIP_VERDICT.EVEN) {
          expect(Number(lower)).toBeLessThanOrEqual(0.5);
          expect(Number(upper)).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });
});
