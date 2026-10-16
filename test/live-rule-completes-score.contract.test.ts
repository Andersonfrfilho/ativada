// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { completesScore } from '../apps/api-ativada/src/runs/live-status/rule-completes-score.js';

const AWAITING = 'awaiting_entry';
const HOLDING = 'holding';

// Contas à mão (spec 014, T1.3): falta 1,0 ponto; a regra de preço pesa 1,5 e vota COMPRAR.
describe('uma regra sozinha completa o placar', () => {
  test('a favor, ainda não atendida e com peso que cobre o que falta: completa', () => {
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '1',
        rule: { isMet: false, vote: 1, weight: '1.5' },
      }),
    ).toBe(true);
  });

  test('o peso exatamente igual ao que falta ainda completa; um pouco menos, não', () => {
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '1.5',
        rule: { isMet: false, vote: 1, weight: '1.5' },
      }),
    ).toBe(true);
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '1.5',
        rule: { isMet: false, vote: 1, weight: '1.499' },
      }),
    ).toBe(false);
  });

  test('regra já atendida, ou contra o lado que a carteira espera, nunca completa', () => {
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '1',
        rule: { isMet: true, vote: 1, weight: '2' },
      }),
    ).toBe(false);
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '1',
        rule: { isMet: false, vote: -1, weight: '2' },
      }),
    ).toBe(false);
  });

  test('comprado, o lado que vale é o da venda', () => {
    expect(
      completesScore({
        state: HOLDING,
        scoreGap: '1',
        rule: { isMet: false, vote: -1, weight: '1' },
      }),
    ).toBe(true);
    expect(
      completesScore({
        state: HOLDING,
        scoreGap: '1',
        rule: { isMet: false, vote: 1, weight: '2' },
      }),
    ).toBe(false);
  });

  test('sem nada faltando (placar já feito) nenhuma regra completa', () => {
    expect(
      completesScore({
        state: AWAITING,
        scoreGap: '0',
        rule: { isMet: false, vote: 1, weight: '3' },
      }),
    ).toBe(false);
  });
});
