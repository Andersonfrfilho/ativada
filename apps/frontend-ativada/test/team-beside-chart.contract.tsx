// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen } from '@testing-library/react';

import { decisionSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { pickDecisionForCandle } from '../src/runs/team-room/compact-team-pick.js';

import { buildDecisionAt, HOUR, openLiveDetail } from './support/live-tracking-harness.js';
import { createRoomHarness, FIXTURE_CANDLE_TIME } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function isBefore(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('detalhe da simulação ao vivo: a sala de operações no alto', () => {
  test('the page opens on the trading room with the chart on its screen, then the short summary, decisions and detail; no balcony and no old room', async () => {
    openLiveDetail(createRoomHarness());
    const tradingRoom = await screen.findByRole('region', { name: 'Sala de operações' });
    const summary = await screen.findByRole('region', { name: 'Sua simulação ao vivo' });
    const chart = await screen.findByRole('region', { name: 'Preço e operações' });
    const decisions = await screen.findByRole('region', { name: /^O que a estratégia decidiu/ });
    const tracking = await screen.findByRole('region', { name: 'Acompanhamento' });
    expect(tradingRoom.contains(chart)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Sala da equipe' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Equipe agora' })).toBeNull();
    const order = [tradingRoom, summary, decisions, tracking];
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

describe('pickDecisionForCandle', () => {
  const latest = buildDecisionAt(0);
  const older = buildDecisionAt(1);
  const decisions = [latest, older].map((raw) => decisionSchema.parse(raw));

  test('without a pointed candle the latest decision speaks', () => {
    expect(pickDecisionForCandle(decisions, undefined)).toBe(decisions[0]);
  });

  test('the same opening, or a bigger candle that covers the instant, finds its decision', () => {
    const olderDecision = decisions[1];
    expect(pickDecisionForCandle(decisions, olderDecision?.candleTime)).toBe(olderDecision);
    expect(pickDecisionForCandle(decisions, (olderDecision?.candleTime ?? 0) + HOUR / 2)).toBe(
      olderDecision,
    );
    expect(pickDecisionForCandle(decisions, FIXTURE_CANDLE_TIME - 50 * HOUR)).toBeUndefined();
  });
});
