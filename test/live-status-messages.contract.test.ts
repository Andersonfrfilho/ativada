// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  BuyAndHold,
  LiveBalance,
} from '../apps/api-ativada/src/runs/live-status/live-balance.js';
import type { LiveGoalProgress } from '../apps/api-ativada/src/runs/live-status/live-goal-progress.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

// As frases vêm do módulo carregado pela raiz da API (o de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { buildBalanceMessage, buildBuyAndHoldMessage, buildGoalMessage } = app.liveStatusMessages;

function balanceOf(overrides: Partial<LiveBalance>): LiveBalance {
  return { initial: '1000', current: '1000', result: '0', resultRate: '0', ...overrides };
}

describe('a frase do saldo (L6): tudo arredonda para baixo, contra o usuário', () => {
  test.each([
    [
      balanceOf({}),
      'Seu saldo agora: 1.000,00 USDT (começou com 1.000,00 USDT). Resultado: 0,00 USDT (0,00%).',
    ],
    [
      balanceOf({ current: '1023.456', result: '23.456', resultRate: '0.023456' }),
      'Seu saldo agora: 1.023,45 USDT (começou com 1.000,00 USDT). Resultado: 23,45 USDT (2,34%).',
    ],
    [
      balanceOf({ current: '950.123', result: '-49.877', resultRate: '-0.049877' }),
      'Seu saldo agora: 950,12 USDT (começou com 1.000,00 USDT). Resultado: −49,88 USDT (−4,99%).',
    ],
    [
      balanceOf({
        initial: '1000000',
        current: '1234567.891',
        result: '234567.891',
        resultRate: '0.234567891',
      }),
      'Seu saldo agora: 1.234.567,89 USDT (começou com 1.000.000,00 USDT). Resultado: 234.567,89 USDT (23,45%).',
    ],
    [
      balanceOf({ current: '999.999', result: '-0.001', resultRate: '-0.000001' }),
      'Seu saldo agora: 999,99 USDT (começou com 1.000,00 USDT). Resultado: −0,01 USDT (−0,01%).',
    ],
  ])('%j', (balance, expected) => {
    expect(buildBalanceMessage({ balance, hasEquityPoint: true })).toBe(expected);
  });

  test('sem vela fechada o saldo é o inicial', () => {
    expect(buildBalanceMessage({ balance: balanceOf({}), hasEquityPoint: false })).toBe(
      'Ainda sem vela fechada; o saldo é o inicial: 1.000,00 USDT.',
    );
  });
});

function holdOf(differencePoints: string, comparison: BuyAndHold['comparison']): BuyAndHold {
  return { value: '1023.4', resultRate: '0.0234', differencePoints, comparison };
}

describe('a comparação com comprar e segurar (L7)', () => {
  test.each([
    [
      holdOf('-2.34', 'below'),
      'A estratégia está 2,34 pontos percentuais abaixo de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('-2.341', 'below'),
      'A estratégia está 2,35 pontos percentuais abaixo de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('2.349', 'above'),
      'A estratégia está 2,34 pontos percentuais acima de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('1', 'above'),
      'A estratégia está 1,00 ponto percentual acima de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('-1', 'below'),
      'A estratégia está 1,00 ponto percentual abaixo de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('-1.001', 'below'),
      'A estratégia está 1,01 pontos percentuais abaixo de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('1234.5', 'above'),
      'A estratégia está 1.234,50 pontos percentuais acima de comprar e segurar no mesmo período.',
    ],
    [
      holdOf('0.005', 'even'),
      'A estratégia está empatada com comprar e segurar no mesmo período (diferença menor que 0,01 ponto percentual).',
    ],
  ])('%j', (buyAndHold, expected) => {
    expect(buildBuyAndHoldMessage(buyAndHold)).toBe(expected);
  });
});

function progressOf(overrides: Partial<LiveGoalProgress>): LiveGoalProgress {
  return {
    targetRate: '0.03',
    targetAmount: '1030',
    remainingAmount: '30',
    remainingRate: '0.03',
    deadlineAt: 0,
    remainingMilliseconds: 0,
    maxLossRate: '0.05',
    floorAmount: '950',
    lossRoomAmount: '50',
    ...overrides,
  };
}

describe('a frase da meta (L8), sem data nem hora (L9)', () => {
  test('o exemplo da spec', () => {
    expect(buildGoalMessage({ progress: progressOf({}), horizonDays: 7, outcome: undefined })).toBe(
      'Meta: +3% em 7 dias → chegar a 1.030,00 USDT. Faltam 30,00 USDT (3,00%). Perda máxima aceita: −5% (950,00 USDT); ainda cabem 50,00 USDT de queda.',
    );
  });

  test('um dia no singular, taxas digitadas com casas e o que falta e o piso para cima, o que cabe para baixo', () => {
    expect(
      buildGoalMessage({
        progress: progressOf({
          targetRate: '0.035',
          maxLossRate: '0.0125',
          targetAmount: '1035.001',
          remainingAmount: '30.001',
          remainingRate: '0.030001',
          floorAmount: '987.501',
          lossRoomAmount: '49.999',
        }),
        horizonDays: 1,
        outcome: undefined,
      }),
    ).toBe(
      'Meta: +3,5% em 1 dia → chegar a 1.035,01 USDT. Faltam 30,01 USDT (3,01%). Perda máxima aceita: −1,25% (987,51 USDT); ainda cabem 49,99 USDT de queda.',
    );
  });

  test.each([
    ['goal_reached', 'Meta alcançada.'],
    ['goal_stopped', 'A simulação parou na perda máxima aceita.'],
    ['goal_expired', 'O prazo da meta acabou.'],
  ] as const)('desfecho %s troca a frase', (outcome, expected) => {
    expect(buildGoalMessage({ progress: progressOf({}), horizonDays: 7, outcome })).toBe(expected);
  });
});

describe('o formato pt-BR dos números', () => {
  const { formatAmount, formatRatePercent, formatPrice, formatPoints, joinNames } =
    app.liveNumberFormat;

  test('dinheiro: duas casas, milhar com ponto, menos tipográfico e sem sinal em zero', () => {
    expect(formatAmount('1234567.891', 'down')).toBe('1.234.567,89');
    expect(formatAmount('1234567.891', 'up')).toBe('1.234.567,90');
    expect(formatAmount('-0.001', 'up')).toBe('0,00');
    expect(formatAmount('-0.001', 'down')).toBe('−0,01');
    expect(formatAmount('0', 'down')).toBe('0,00');
  });

  test('porcentagem de uma fração e preços', () => {
    expect(formatRatePercent('0.0234', 'down')).toBe('2,34');
    expect(formatRatePercent('-0.0234', 'down')).toBe('−2,34');
    expect(formatPrice('0.00001234')).toBe('0,00001234');
    expect(formatPrice('65000')).toBe('65.000,00');
    expect(formatPoints('-2')).toBe('−2');
    expect(formatPoints('0.5')).toBe('0,5');
  });

  test('lista de nomes', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A e B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B e C');
  });
});
