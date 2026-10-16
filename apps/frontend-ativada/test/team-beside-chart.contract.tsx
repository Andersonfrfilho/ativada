// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen } from '@testing-library/react';

import { createRoomHarness } from './support/team-room-fixtures.js';
import { openLiveDetail } from './support/live-tracking-harness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function isBefore(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('detalhe da simulação ao vivo: a equipe junto do gráfico', () => {
  test('the page goes pulse, short summary, chart, decisions, detail and only then the big room', async () => {
    openLiveDetail(createRoomHarness());
    const summary = await screen.findByRole('region', { name: 'Sua simulação ao vivo' });
    const chart = await screen.findByRole('region', { name: 'Preço e operações' });
    const decisions = await screen.findByRole('region', { name: /^O que a estratégia decidiu/ });
    const tracking = await screen.findByRole('region', { name: 'Acompanhamento' });
    const room = await screen.findByRole('region', { name: 'Sala da equipe' });
    const order = [summary, chart, decisions, tracking, room];
    order.slice(1).forEach((section, index) => {
      expect(isBefore(order[index] ?? section, section)).toBe(true);
    });
  });

  test('the short summary shows balance, result and buy and hold in words, with the server numbers', async () => {
    openLiveDetail(createRoomHarness());
    const summary = await screen.findByRole('region', { name: 'Sua simulação ao vivo' });
    expect(summary.textContent).toContain('Saldo');
    expect(summary.textContent).toContain('Resultado');
    expect(summary.textContent).toContain('Comprar e segurar');
    expect(summary.textContent).toContain('1.030,50 USDT');
    expect(summary.textContent).toContain('acima do início');
  });
});
