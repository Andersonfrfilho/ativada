// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import { alertPayload, REASON_TEXT } from './fixtures/telegram/alert-payload.fixture.js';

const { formatAlertMessage } = await loadAlertsApi();

function messageOf(
  side: 'BUY' | 'SELL',
  overrides: Parameters<typeof alertPayload>[0] = {},
): string {
  const payload = alertPayload(overrides);
  return formatAlertMessage({ side, payload: payload as never });
}

describe('texto do alerta de sinal', () => {
  test('compra: par, preço, placar, motivo, ação simulada, stop, alvo e acerto histórico', () => {
    const text = messageOf('BUY');
    expect(text).toContain('COMPRA');
    expect(text).toContain('BTCUSDT');
    expect(text).toContain('1h');
    expect(text).toContain('64000.1');
    expect(text).toContain('3.5');
    expect(text).toContain(REASON_TEXT);
    expect(text).toContain('62900');
    expect(text).toContain('66800.5');
    expect(text).toContain('58,3%');
    expect(text).toContain('24 operações');
    expect(text).toContain('próximo candle');
  });

  test('venda: leva o lado, a saída da posição e o aviso de que é simulação', () => {
    const text = messageOf('SELL', { simulatedAction: 'exit', reason: 'Venda 3/4: perde a média' });
    expect(text).toContain('VENDA');
    expect(text).toContain('Venda 3/4: perde a média');
    expect(text.toLowerCase()).toContain('sair');
    expect(text.toLowerCase()).toContain('não é recomendação');
  });

  test('sem walk-forward concluído diz isso, em vez de inventar um acerto', () => {
    const text = messageOf('BUY', { hitRate: null });
    expect(text).not.toContain('%');
    expect(text.toLowerCase()).toContain('sem walk-forward');
  });

  test('sem posição não há stop nem alvo para mostrar', () => {
    const text = messageOf('SELL', { simulatedAction: 'none', stopPrice: null, targetPrice: null });
    expect(text).not.toContain('Stop:');
    expect(text).not.toContain('Alvo:');
    expect(text.toLowerCase()).toContain('nenhuma');
  });

  test.each([
    ['BUY', 'carteira já posicionada'],
    ['SELL', 'sem posição aberta'],
  ] as const)('sinal %s sem ordem explica por quê (%s)', (side, fragment) => {
    const text = messageOf(side, { simulatedAction: 'none' });
    expect(text.toLowerCase()).toContain(fragment);
  });

  test('o acerto histórico é arredondado a uma casa, em formato brasileiro', () => {
    expect(messageOf('BUY', { hitRate: { winRate: '0.5', trades: 2 } })).toContain('50,0%');
    expect(messageOf('BUY', { hitRate: { winRate: '0.66666', trades: 3 } })).toContain('66,7%');
    expect(messageOf('BUY', { hitRate: { winRate: '1', trades: 1 } })).toContain('100,0%');
    expect(messageOf('BUY', { hitRate: { winRate: '0', trades: 1 } })).toContain('0,0%');
  });

  test.each([
    ['trending', 'tendência'],
    ['ranging', 'lateral'],
    ['none', 'indefinido'],
  ])('regime %s aparece como "%s"', (regime, label) => {
    expect(messageOf('BUY', { regime })).toContain(label);
  });

  test('motivo gigante não passa do limite de 4096 caracteres do Telegram', () => {
    const text = messageOf('BUY', { reason: 'x'.repeat(10_000) });
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('Acerto histórico');
  });

  test('o texto não leva nada além do que o payload tem: sem chat, sem id, sem nome', () => {
    const text = messageOf('BUY');
    expect(text).not.toMatch(/\d{8,}/u);
  });
});
