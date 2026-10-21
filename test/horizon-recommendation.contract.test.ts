// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { HorizonSummary } from '../packages/strategy-engine/src/horizon/horizon.types.js';
import { loadHorizonApi } from './fixtures/strategy-engine/horizon/horizon-api.fixture.js';

const api = await loadHorizonApi();
const WINDOWS = 100;
const POSITIVE_AT_THRESHOLD = 55;

type RowOverrides = Partial<Omit<HorizonSummary, 'horizonDays'>>;

function row(horizonDays: number, overrides: RowOverrides = {}): HorizonSummary {
  return {
    horizonDays,
    windowCount: WINDOWS,
    positiveCount: 60,
    median: '0.1',
    positiveRate: '0.6',
    worstDecile: '-0.05',
    isShortHistory: false,
    benchmark: { median: '0', positiveRate: '0', worstDecile: '0' },
    ...overrides,
  };
}

describe('recommendHorizon: elegibilidade (spec 003 §5, itens 1 e 4)', () => {
  test('uma linha que passa em tudo é recomendada', () => {
    expect(api.recommendHorizon([row(30)])).toBe(30);
  });

  test('mediana tem de ser MAIOR que zero: zero e negativa não são elegíveis', () => {
    expect(api.recommendHorizon([row(30, { median: '0' })])).toBeUndefined();
    expect(api.recommendHorizon([row(30, { median: '-0.01' })])).toBeUndefined();
    expect(api.recommendHorizon([row(30, { median: '0.00000001' })])).toBe(30);
  });

  test('positivas: 55% exatos passam, 54 de 100 não (contagens exatas, não a fração publicada)', () => {
    expect(api.recommendHorizon([row(30, { positiveCount: POSITIVE_AT_THRESHOLD })])).toBe(30);
    expect(api.recommendHorizon([row(30, { positiveCount: POSITIVE_AT_THRESHOLD - 1 })])).toBe(
      undefined,
    );
  });

  test('a fração publicada não decide: 0.55 com 32 de 60 positivas (53,3%) não passa', () => {
    const publishedButNotReal = row(30, {
      windowCount: 60,
      positiveCount: 32,
      positiveRate: '0.55',
    });
    expect(api.recommendHorizon([publishedButNotReal])).toBeUndefined();
    expect(api.recommendHorizon([{ ...publishedButNotReal, positiveCount: 33 }])).toBe(30);
  });

  test('pior 10%: -10% exatos passam, abaixo disso não', () => {
    expect(api.recommendHorizon([row(30, { worstDecile: '-0.1' })])).toBe(30);
    expect(api.recommendHorizon([row(30, { worstDecile: '-0.10000001' })])).toBeUndefined();
    expect(api.recommendHorizon([row(30, { worstDecile: '-0.09999999' })])).toBe(30);
  });

  test('histórico curto nunca é elegível, mesmo com números ótimos', () => {
    expect(api.recommendHorizon([row(30, { isShortHistory: true, median: '5' })])).toBeUndefined();
  });

  test('linha sem janela (tudo nulo) não é elegível', () => {
    const empty = row(30, {
      windowCount: 0,
      positiveCount: 0,
      median: null,
      positiveRate: null,
      worstDecile: null,
      isShortHistory: false,
    });
    expect(api.recommendHorizon([empty])).toBeUndefined();
  });

  test('nenhuma elegível, ou nenhuma linha: não recomenda nada', () => {
    expect(api.recommendHorizon([])).toBeUndefined();
    expect(
      api.recommendHorizon([row(7, { median: '-0.1' }), row(15, { positiveCount: 10 })]),
    ).toBeUndefined();
  });

  test('a inelegível não recomenda mesmo com a maior mediana por dia', () => {
    const rows = [row(7, { median: '9', positiveCount: 1 }), row(15, { median: '0.15' })];
    expect(api.recommendHorizon(rows)).toBe(15);
  });
});

describe('recommendHorizon: ordem (spec 003 §5, itens 2 e 3)', () => {
  test('vence a maior mediana POR DIA, não a maior mediana', () => {
    // 7 dias: 0.07 / 7 = 0.01 por dia. 15 dias: 0.30 / 15 = 0.02 por dia. 30 dias: 0.45 / 30 = 0.015 por dia.
    const rows = [
      row(7, { median: '0.07' }),
      row(15, { median: '0.3' }),
      row(30, { median: '0.45' }),
    ];
    expect(api.recommendHorizon(rows)).toBe(15);
  });

  test('a maior mediana absoluta perde quando a mediana por dia é menor', () => {
    const rows = [row(7, { median: '0.14' }), row(30, { median: '0.3' })];
    expect(api.recommendHorizon(rows)).toBe(7);
  });

  test('empate de mediana por dia: vence o prazo mais longo, em qualquer ordem de entrada', () => {
    // 7 dias: 0.07 / 7 = 0.01 por dia; 30 dias: 0.3 / 30 = 0.01 por dia.
    const shortOne = row(7, { median: '0.07' });
    const longOne = row(30, { median: '0.3' });
    expect(api.recommendHorizon([shortOne, longOne])).toBe(30);
    expect(api.recommendHorizon([longOne, shortOne])).toBe(30);
  });

  test('a mediana por dia é arredondada para BAIXO a 8 casas: o que só difere depois da 8ª casa empata', () => {
    // 7 dias: 8e-8 / 7 = 1,14e-8 e 15 dias: 1,5e-7 / 15 = 1e-8. Exatas (ou para cima), a de 7 dias ganharia; para baixo empatam
    // em 1e-8 e vence a mais longa.
    const roundedUp = [row(7, { median: '0.00000008' }), row(15, { median: '0.00000015' })];
    expect(api.recommendHorizon(roundedUp)).toBe(15);
    // 7 dias: 1,3e-7 / 7 = 1,86e-8 (meio-arredondado daria 2e-8): para baixo é 1e-8 e empata com a de 15 dias.
    const roundedHalfUp = [row(7, { median: '0.00000013' }), row(15, { median: '0.00000015' })];
    expect(api.recommendHorizon(roundedHalfUp)).toBe(15);
  });

  test('só as elegíveis concorrem: a de maior mediana por dia que falha no pior 10% perde', () => {
    const rows = [row(7, { median: '0.7', worstDecile: '-0.2' }), row(15, { median: '0.15' })];
    expect(api.recommendHorizon(rows)).toBe(15);
  });
});
