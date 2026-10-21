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
  test('a compact line, then the trading room with the chart on its screen, then the tabs; no balcony and no old room', async () => {
    openLiveDetail(createRoomHarness());
    const tradingRoom = await screen.findByRole('region', { name: 'Sala de operações' });
    const chart = await screen.findByRole('region', { name: 'Telão: gráfico da simulação' });
    const tabs = await screen.findByRole('tablist', { name: 'Detalhes da simulação' });
    expect(tradingRoom.contains(chart)).toBe(true);
    expect(isBefore(tradingRoom, tabs)).toBe(true);
    const chips = screen.getAllByText('Ao vivo');
    expect(isBefore(chips.at(-1) ?? tradingRoom, tradingRoom)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Sala da equipe' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Equipe agora' })).toBeNull();
  });

  test('the short summary (Acompanhamento tab) shows balance, result and buy and hold in words, with the server numbers', async () => {
    openLiveDetail(createRoomHarness(), '#acompanhamento');
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
