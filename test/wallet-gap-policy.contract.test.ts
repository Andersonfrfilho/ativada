// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  carriedWallet,
  handStep,
  MARKET_ENTRY_ORDER,
  PENDING_SIGNAL_EXIT,
} from './fixtures/strategy-engine/production/hand-wallet.fixture.js';

// Lacuna confirmada: não sabemos o que aconteceu nos candles ausentes. A posição aberta tem o stop tocado e
// sai na abertura do candle seguinte à lacuna (ADR 0002 §c); as ordens pendentes caducam; nada entra nele.
// Posição de 23,5513 a 100,05, stop 96,05, alvo 106,05, caixa 7641,33612743.
describe('a confirmed gap ends the open position and cancels the pending orders', () => {
  test('the position exits at min(stop, open) minus slippage, reason gap, with the normal fee', () => {
    // 96,05 × 0,9995 = 96,001975 → 96,00; 2260,9248 − 2,2609248; custo da entrada 2358,66387257.
    const result = handStep({
      state: carriedWallet(),
      candle: ['100', '101', '99', '100'],
      gapCandles: 2,
    });
    expect(result.decisions.closedPositions).toHaveLength(1);
    expect(result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'gap',
      exitPrice: '96',
      exitFee: '2.2609248',
      netProfit: '-99.99999737',
    });
    expect(result.decisions.orders.map((order) => `${order.type}:${order.status}`)).toStrictEqual([
      'market:created',
      'market:filled',
    ]);
    expect(result.decisions.orders.map((order) => order.reason)).toStrictEqual(['gap', 'gap']);
    expect(result.state.position).toBeNull();
    expect(result.state.cash).toBe('9900.00000263');
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '9900.00000263',
      equityAtLow: '9900.00000263',
    });
  });

  test('an open below the stop exits at the open, worse than the stop', () => {
    const result = handStep({
      state: carriedWallet(),
      candle: ['90', '91', '89', '90'],
      gapCandles: 1,
    });
    expect(result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'gap',
      exitPrice: '89.95',
      exitFee: '2.11843944',
      netProfit: '-242.34287701',
    });
    expect(result.state.cash).toBe('9757.65712299');
  });

  test('the target is not honoured across the gap: an open above it still exits at the stop', () => {
    const result = handStep({
      state: carriedWallet(),
      candle: ['108', '109', '107', '108'],
      gapCandles: 1,
    });
    expect(result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'gap',
      exitPrice: '96',
    });
  });

  test('a pending exit is cancelled with reason gap and the gap exit replaces it', () => {
    const result = handStep({
      state: carriedWallet({ pendingOrder: PENDING_SIGNAL_EXIT }),
      candle: ['100', '101', '99', '100'],
      gapCandles: 1,
    });
    expect(result.decisions.orders.map((order) => `${order.orderKey}:${order.status}`)).toEqual([
      'order-1:cancelled',
      'order-0:created',
      'order-0:filled',
    ]);
    expect(result.decisions.orders[0]).toMatchObject({ reason: 'gap' });
    expect(result.decisions.closedPositions[0]).toMatchObject({ exitReason: 'gap' });
    expect(result.state.pendingOrder).toBeNull();
  });

  test('a pending entry is cancelled with reason gap and never fills', () => {
    const result = handStep({
      state: { pendingOrder: MARKET_ENTRY_ORDER },
      candle: ['100', '101', '99', '100'],
      gapCandles: 1,
    });
    expect(result.decisions.orders).toHaveLength(1);
    expect(result.decisions.orders[0]).toMatchObject({ status: 'cancelled', reason: 'gap' });
    expect(result.decisions.fills).toStrictEqual([]);
    expect(result.state.position).toBeNull();
    expect(result.state.cash).toBe('10000');
  });

  test('no new entry is created in the candle that follows a gap, even with a BUY', () => {
    const result = handStep({
      state: carriedWallet(),
      candle: ['100', '101', '99', '100'],
      gapCandles: 1,
      action: 'BUY',
    });
    expect(result.decisions.orders.some((order) => order.purpose === 'entry')).toBe(false);
    expect(result.state.pendingOrder).toBeNull();
  });

  test('without a gap the same BUY on a free wallet creates the entry (control)', () => {
    const result = handStep({ state: {}, candle: ['100', '101', '99', '100'], action: 'BUY' });
    expect(result.decisions.orders.some((order) => order.purpose === 'entry')).toBe(true);
  });
});
