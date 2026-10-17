// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { BudgetDecision, ModelTokenUsage } from '../packages/model-agents/src/index.js';
import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';

// T1.3 da spec 015 (RF16, RNF06, plan D4): contas à mão, arredondamento para cima a 8 casas e bordas exatas do teto.

const api = await loadModelAgentsApi();
const HAIKU = { inputUsdPerMegaToken: '0.10', outputUsdPerMegaToken: '0.50' };
const SONNET = { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '10' };
const GEMINI = { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '12' };

function usage(inputTokens: number, outputTokens: number, thinkingTokens = 0): ModelTokenUsage {
  return { inputTokens, outputTokens, thinkingTokens };
}

describe('custo da chamada (contas à mão)', () => {
  test('Haiku: 3.000 de entrada e 120 de saída = US$ 0,00036', () => {
    // (3000 × 0,10 + 120 × 0,50) ÷ 1.000.000 = (300 + 60) ÷ 1.000.000
    expect(api.computeCallCost({ usage: usage(3000, 120), price: HAIKU })).toBe('0.00036');
  });

  test('Sonnet: 3.000 e 120 = US$ 0,0072', () => {
    // (6000 + 1200) ÷ 1.000.000
    expect(api.computeCallCost({ usage: usage(3000, 120), price: SONNET })).toBe('0.0072');
  });

  test('Gemini: o raciocínio é cobrado como saída (3.000, 120 e 800 = US$ 0,01704)', () => {
    // (6000 + 920 × 12) ÷ 1.000.000 = 17040 ÷ 1.000.000
    expect(api.computeCallCost({ usage: usage(3000, 120, 800), price: GEMINI })).toBe('0.01704');
    expect(api.computeCallCost({ usage: usage(3000, 120, 0), price: GEMINI })).toBe('0.00744');
  });

  test('arredonda SEMPRE para cima a 8 casas', () => {
    // 7 × 0,3333 = 2,3331 ÷ 1.000.000 = 0,0000023331 → 0,00000234
    const price = { inputUsdPerMegaToken: '0.3333', outputUsdPerMegaToken: '0' };
    expect(api.computeCallCost({ usage: usage(7, 0), price })).toBe('0.00000234');
    // 1 token a 0,00000001 por milhão = 1e-14 → sobe para 0,00000001
    const tiny = { inputUsdPerMegaToken: '0.00000001', outputUsdPerMegaToken: '0' };
    expect(api.computeCallCost({ usage: usage(1, 0), price: tiny })).toBe('0.00000001');
  });

  test('sem uso, sem custo; com resultado exato, não sobe', () => {
    expect(api.computeCallCost({ usage: usage(0, 0), price: GEMINI })).toBe('0');
    expect(api.computeCallCost({ usage: usage(1_000_000, 0), price: SONNET })).toBe('2');
    expect(api.computeCallCost({ usage: usage(0, 1_000_000), price: SONNET })).toBe('10');
  });

  test('o preço de entrada e o de saída não se trocam', () => {
    const price = { inputUsdPerMegaToken: '1', outputUsdPerMegaToken: '100' };
    expect(api.computeCallCost({ usage: usage(1_000_000, 0), price })).toBe('1');
    expect(api.computeCallCost({ usage: usage(0, 1_000_000), price })).toBe('100');
  });
});

describe('custo das três equipes (spec §8, saída maior da revisão 2)', () => {
  // Entrada 3.200; saída visível 450; raciocínio: Gemini 800, OpenAI 500, Claude nenhum.
  const OPENAI = { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '10' };
  const nina = api.computeCallCost({ usage: usage(3200, 450, 800), price: GEMINI });
  const lucas = api.computeCallCost({ usage: usage(3200, 450, 0), price: SONNET });
  const olivia = api.computeCallCost({ usage: usage(3200, 450, 500), price: OPENAI });

  test('por chamada: Nina 0,0214, Lucas 0,0109 e Olívia 0,0159', () => {
    // Nina (6400 + 1250 × 12) = 21400; Lucas (6400 + 4500) = 10900; Olívia (6400 + 950 × 10) = 15900
    expect(nina).toBe('0.0214');
    expect(lucas).toBe('0.0109');
    expect(olivia).toBe('0.0159');
  });

  test('as três juntas: 0,0482 por vela, US$ 4,6272 por dia e US$ 138,816 por mês', () => {
    const together = [nina, lucas, olivia].reduce((sum, cost) => sum + Number(cost), 0);
    expect(together.toFixed(4)).toBe('0.0482');
    expect((together * 96).toFixed(4)).toBe('4.6272');
    expect((together * 2880).toFixed(3)).toBe('138.816');
  });

  test('Nina com raciocínio alto (3.000) custa 0,0478 por chamada', () => {
    expect(api.computeCallCost({ usage: usage(3200, 450, 3000), price: GEMINI })).toBe('0.0478');
  });

  test('as opções econômicas: Haiku 0,000545 e Luna 0,000795 por chamada', () => {
    const cheap = { inputUsdPerMegaToken: '0.10', outputUsdPerMegaToken: '0.50' };
    expect(api.computeCallCost({ usage: usage(3200, 450, 0), price: cheap })).toBe('0.000545');
    expect(api.computeCallCost({ usage: usage(3200, 450, 500), price: cheap })).toBe('0.000795');
  });
});

describe('reserva antes de chamar (plan D4)', () => {
  test('a entrada estimada é o tamanho do texto ÷ 3, para cima', () => {
    expect(api.estimateInputTokens(0)).toBe(0);
    expect(api.estimateInputTokens(9000)).toBe(3000);
    expect(api.estimateInputTokens(9001)).toBe(3001);
    expect(api.estimateInputTokens(1)).toBe(1);
  });

  test('Gemini: 9.000 caracteres, 300 de saída e 2.000 de raciocínio = US$ 0,0336', () => {
    // entrada 3000 × 2 = 6000; saída (300 + 2000) × 12 = 27600; 33600 ÷ 1.000.000
    const reservation = api.computeReservation({
      promptLength: 9000,
      maxOutputTokens: 300,
      maxThinkingTokens: 2000,
      price: GEMINI,
    });
    expect(reservation).toBe('0.0336');
  });

  test('sem raciocínio, só a saída máxima conta', () => {
    // entrada 3001 × 0,10 = 300,1; saída 300 × 0,50 = 150; 450,1 ÷ 1.000.000
    const reservation = api.computeReservation({
      promptLength: 9001,
      maxOutputTokens: 300,
      maxThinkingTokens: 0,
      price: HAIKU,
    });
    expect(reservation).toBe('0.0004501');
  });

  test('a reserva nunca fica abaixo do custo real do mesmo uso máximo', () => {
    const reservation = api.computeReservation({
      promptLength: 9000,
      maxOutputTokens: 300,
      maxThinkingTokens: 2000,
      price: GEMINI,
    });
    const cost = api.computeCallCost({ usage: usage(3000, 300, 2000), price: GEMINI });
    expect(reservation).toBe(cost);
  });
});

describe('teto de custo (RF16)', () => {
  const limits = { dailyUsd: '3', monthlyUsd: '60' };

  function decide(dayUsd: string, monthUsd: string, reservationUsd: string): BudgetDecision {
    return api.decideBudget({ usage: { dayUsd, monthUsd }, reservationUsd, limits });
  }

  test('abaixo dos dois tetos, passa', () => {
    expect(decide('0', '0', '0.0336')).toBe('allow');
  });

  test('ficar EXATAMENTE no teto do dia ainda cabe; um centavo de milionésimo a mais, não', () => {
    expect(decide('2.9', '2.9', '0.1')).toBe('allow');
    expect(decide('2.90000001', '2.90000001', '0.1')).toBe('deny_day');
  });

  test('ficar EXATAMENTE no teto do mês ainda cabe; passar, não', () => {
    expect(decide('0', '59.9', '0.1')).toBe('allow');
    expect(decide('0', '59.90000001', '0.1')).toBe('deny_month');
  });

  test('a soma é decimal exata, sem erro de ponto flutuante', () => {
    const tight = { dailyUsd: '0.3', monthlyUsd: '0.3' };
    const usageNow = { dayUsd: '0.1', monthUsd: '0.1' };
    expect(api.decideBudget({ usage: usageNow, reservationUsd: '0.2', limits: tight })).toBe(
      'allow',
    );
  });

  test('o dia vence o mês quando os dois estouram', () => {
    expect(decide('3', '60', '0.1')).toBe('deny_day');
  });

  test('o mês barra mesmo com o dia livre', () => {
    expect(decide('0.5', '60', '0.1')).toBe('deny_month');
  });

  test('reserva zero com o teto cheio ainda passa', () => {
    expect(decide('3', '60', '0')).toBe('allow');
  });
});
