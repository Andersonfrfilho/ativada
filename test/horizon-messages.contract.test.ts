// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { HorizonSummary, IntradaySummary } from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const { describeDailyRow, describeIntradayRow, describeRecommendation } = app.horizonMessages;

function daily(overrides: Partial<HorizonSummary> = {}): HorizonSummary {
  return {
    horizonDays: 7,
    windowCount: 100,
    positiveCount: 52,
    median: '0.0041',
    positiveRate: '0.52',
    worstDecile: '-0.03',
    isShortHistory: false,
    benchmark: { median: '0', positiveRate: '0.5', worstDecile: '-0.2' },
    ...overrides,
  };
}

function intraday(overrides: Partial<IntradaySummary> = {}): IntradaySummary {
  return {
    netReturn: '-0.01',
    tradeCount: 10,
    feesPaid: '150',
    feeShareOfGross: null,
    verdict: 'NAO_COMPENSA',
    ...overrides,
  };
}

function row(summary: HorizonSummary, isRecommended = false): string {
  return describeDailyRow({ summary, isRecommended });
}

describe('frases das linhas de dias', () => {
  test('a frase do spec, com a mediana de sinal e as vezes positivas sem casa decimal', () => {
    expect(row(daily())).toBe('Por 7 dias: em geral +0,4%, positivo em 52% das vezes.');
    expect(row(daily({ horizonDays: 30, median: '0.0231', positiveRate: '0.61' }))).toBe(
      'Por 30 dias: em geral +2,3%, positivo em 61% das vezes.',
    );
  });

  test('arredonda contra o usuário: ganho e acertos para baixo, perda para o pior', () => {
    expect(row(daily({ median: '0.00499999' }))).toContain('em geral +0,4%');
    expect(row(daily({ median: '0.0001' }))).toContain('em geral 0,0%');
    expect(row(daily({ median: '-0.0041' }))).toContain('em geral -0,5%');
    expect(row(daily({ median: '-0.0001' }))).toContain('em geral -0,1%');
    expect(row(daily({ positiveRate: '0.5299' }))).toContain('positivo em 52% das vezes');
    expect(row(daily({ positiveRate: '0.5' }))).toContain('positivo em 50% das vezes');
  });

  test('mediana zero não leva sinal, e nunca sai "-0,0%"', () => {
    expect(row(daily({ median: '0' }))).toContain('em geral 0,0%');
    expect(row(daily({ median: '-0' }))).toContain('em geral 0,0%');
    expect(row(daily({ median: '0.00004' }))).not.toContain('+');
  });

  test('usa vírgula decimal e nunca notação científica', () => {
    const text = row(daily({ median: '0.00000001' }));
    expect(text).not.toMatch(/e[+-]?\d/);
    expect(text).not.toMatch(/\d\.\d/);
    expect(row(daily({ median: '1.2345' }))).toContain('em geral +123,4%');
  });

  test('o selo e o aviso de histórico curto entram só quando valem', () => {
    expect(row(daily(), true)).toBe(
      'Por 7 dias: em geral +0,4%, positivo em 52% das vezes. É o prazo mais recomendável no histórico.',
    );
    expect(row(daily({ isShortHistory: true }))).toBe(
      'Por 7 dias: em geral +0,4%, positivo em 52% das vezes. Histórico curto: poucas janelas para confiar.',
    );
    expect(row(daily())).not.toContain('recomendável');
    expect(row(daily())).not.toContain('Histórico curto');
  });

  test('sem janela nenhuma a frase diz que falta histórico, sem número', () => {
    expect(
      row(daily({ median: null, positiveRate: null, worstDecile: null, windowCount: 0 })),
    ).toBe('Por 7 dias: ainda não há histórico suficiente para este prazo.');
  });
});

describe('frases da linha de 15 minutos', () => {
  test('taxas comendo o ganho: a frase do spec', () => {
    expect(describeIntradayRow(intraday({ netReturn: '-0.002', feeShareOfGross: '1.4' }))).toBe(
      'Operar de 15 em 15 minutos: não compensa (as taxas comem o ganho).',
    );
  });

  test('perdeu mesmo antes das taxas, não fechou operação e sem resultado têm o seu motivo', () => {
    expect(describeIntradayRow(intraday())).toBe(
      'Operar de 15 em 15 minutos: não compensa (a estratégia perdeu dinheiro mesmo antes das taxas).',
    );
    expect(describeIntradayRow(intraday({ tradeCount: 0, netReturn: '0' }))).toBe(
      'Operar de 15 em 15 minutos: não compensa (a estratégia não fechou nenhuma operação nos últimos 90 dias).',
    );
    // Posição aberta no fim com prejuízo: `trades` só conta as fechadas, então a frase não diz que ela "não operou".
    expect(describeIntradayRow(intraday({ tradeCount: 0, netReturn: '-0.03' }))).toBe(
      'Operar de 15 em 15 minutos: não compensa (a estratégia não fechou nenhuma operação nos últimos 90 dias).',
    );
    expect(describeIntradayRow(intraday({ netReturn: null }))).toBe(
      'Operar de 15 em 15 minutos: não compensa (sem resultado calculado).',
    );
  });

  test('compensou: líquido para baixo, taxas para cima, operações no singular e no plural', () => {
    const worth = intraday({
      verdict: 'COMPENSA',
      netReturn: '0.01249',
      tradeCount: 12,
      feeShareOfGross: '0.2501',
    });
    expect(describeIntradayRow(worth)).toBe(
      'Operar de 15 em 15 minutos: compensou nos últimos 90 dias, +1,2% depois das taxas (12 operações, taxas de 26% do ganho bruto).',
    );
    expect(describeIntradayRow({ ...worth, tradeCount: 1 })).toContain('(1 operação,');
  });
});

describe('frase da recomendação', () => {
  test('cada situação tem a sua frase', () => {
    const base = { evaluatedStrategies: 2, hasDailyRows: true, recommendedHorizonDays: undefined };
    expect(describeRecommendation(base)).toBe('Nenhum prazo compensou no histórico desta moeda.');
    expect(describeRecommendation({ ...base, recommendedHorizonDays: 30 })).toBe(
      'O prazo mais recomendável no histórico desta moeda é de 30 dias.',
    );
    expect(describeRecommendation({ ...base, evaluatedStrategies: 0 })).toBe(
      'Você ainda não tem estratégia para comparar os prazos desta moeda.',
    );
    expect(describeRecommendation({ ...base, hasDailyRows: false })).toBe(
      'Ainda não há candles suficientes para comparar os prazos desta moeda.',
    );
  });
});
