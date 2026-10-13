// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildTradeSummaryMessage,
  type TradeSummaryNumbers,
} from '../apps/api-ativada/src/runs/trade-summary/trade-summary-message.js';

function numbers(overrides: Partial<TradeSummaryNumbers> = {}): TradeSummaryNumbers {
  return {
    closedTrades: 3,
    totalPaid: '98410.215',
    totalReceived: '97902.10',
    totalFees: '196.301',
    net: '-508.115',
    openTrades: 0,
    openPaid: undefined,
    ...overrides,
  };
}

describe('frase do resumo das operações', () => {
  test('o exemplo da spec: milhar com ponto, vírgula decimal e menos tipográfico', () => {
    expect(buildTradeSummaryMessage(numbers())).toBe(
      'Você pagou 98.410,22 USDT em 3 compras e recebeu 97.902,10 USDT nas vendas. Taxas: 196,31 USDT. Saldo líquido: −508,12 USDT.',
    );
  });

  test('arredonda contra o usuário: pago e taxas para cima, recebido e saldo para baixo', () => {
    const message = buildTradeSummaryMessage(
      numbers({ totalPaid: '10.001', totalReceived: '10.009', totalFees: '0.001', net: '0.009' }),
    );
    expect(message).toContain('pagou 10,01 USDT');
    expect(message).toContain('recebeu 10,00 USDT');
    expect(message).toContain('Taxas: 0,01 USDT');
    expect(message).toContain('Saldo líquido: 0,00 USDT');
  });

  test('saldo negativo arredonda para -infinito e zero não leva sinal', () => {
    expect(buildTradeSummaryMessage(numbers({ net: '-0.001' }))).toContain(
      'Saldo líquido: −0,01 USDT',
    );
    expect(buildTradeSummaryMessage(numbers({ net: '0' }))).toContain('Saldo líquido: 0,00 USDT');
    expect(buildTradeSummaryMessage(numbers({ net: '-0.00000000' }))).toContain(
      'Saldo líquido: 0,00 USDT',
    );
  });

  test('milhar em valores grandes e na virada de casa', () => {
    const message = buildTradeSummaryMessage(
      numbers({
        totalPaid: '999.999',
        totalReceived: '1234567.891',
        totalFees: '1000',
        net: '12345678.9',
      }),
    );
    expect(message).toContain('pagou 1.000,00 USDT');
    expect(message).toContain('recebeu 1.234.567,89 USDT');
    expect(message).toContain('Taxas: 1.000,00 USDT');
    expect(message).toContain('Saldo líquido: 12.345.678,90 USDT');
  });

  test('uma compra só fica no singular', () => {
    expect(buildTradeSummaryMessage(numbers({ closedTrades: 1 }))).toContain(
      'em 1 compra e recebeu',
    );
  });

  test('sem operação fechada', () => {
    expect(buildTradeSummaryMessage(numbers({ closedTrades: 0 }))).toBe(
      'Nenhuma operação fechada ainda.',
    );
  });

  test('com operação aberta: uma no singular, várias no plural, pago para cima', () => {
    expect(buildTradeSummaryMessage(numbers({ openTrades: 1, openPaid: '412.0001' }))).toEndWith(
      ' + uma operação ainda aberta, com 412,01 USDT pagos.',
    );
    expect(buildTradeSummaryMessage(numbers({ openTrades: 2, openPaid: '1500' }))).toEndWith(
      ' + 2 operações ainda abertas, com 1.500,00 USDT pagos.',
    );
  });

  test('só aberta: a frase de nenhuma fechada mais a parte da aberta', () => {
    expect(
      buildTradeSummaryMessage(numbers({ closedTrades: 0, openTrades: 1, openPaid: '412' })),
    ).toBe('Nenhuma operação fechada ainda. + uma operação ainda aberta, com 412,00 USDT pagos.');
  });
});
