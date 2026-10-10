// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  carriedWallet,
  handStep,
  MARKET_ENTRY_ORDER,
  PENDING_SIGNAL_EXIT,
} from './fixtures/strategy-engine/production/hand-wallet.fixture.js';

// Contas à mão (tick 0,01, taxa 0,1%, slippage 0,05%): posição de 23,5513 a 100,05, stop 96,05, alvo 106,05,
// caixa 7641,33612743. Liquidação a P: floor8(q × tickDown(P × 0,9995)) − ceil8(taxa).
describe('equityAtLow counts the position that existed during the candle (constitution §3)', () => {
  test('a position that leaves through the target is held at the low: the valley is not hidden', () => {
    // Abre 100, mínima 97,5, máxima 110, sai pelo alvo 106,05 (o stop 96,05 não é tocado).
    // Fechamento: 7641,33612743 + (2497,615365 − 2,49761537) = 10136,45387706.
    // Mínima: 97,5 × 0,9995 → 97,45; 23,5513 × 97,45 = 2295,074185; taxa 2,29507419 → +2292,77911081.
    const result = handStep({ state: carriedWallet(), candle: ['100', '110', '97.5', '108'] });
    expect(result.decisions.closedPositions[0]).toMatchObject({ exitReason: 'target' });
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '10136.45387706',
      equityAtLow: '9934.11523824',
    });
  });

  test('a market entry filled at the open and sold at the target in the same candle is held at the low', () => {
    // Caixa depois da entrada 7641,33612743; mínima 99 → 98,95; 23,5513 × 98,95 = 2330,401135; taxa 2,33040114.
    const result = handStep({
      state: { pendingOrder: MARKET_ENTRY_ORDER },
      candle: ['100', '110', '99', '108'],
    });
    expect(result.decisions.fills.map((fill) => fill.side)).toStrictEqual(['buy', 'sell']);
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '10136.45387706',
      equityAtLow: '9969.40686129',
    });
  });

  test('a position still open at the close is valued at the low as before', () => {
    const result = handStep({ state: carriedWallet(), candle: ['100', '101', '99', '100'] });
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '9992.93460999',
      equityAtLow: '9969.40686129',
    });
  });

  test('a position that leaves through the stop is not held at the low: the stop exit is the minimum', () => {
    // Sai a tickDown(96,05 × 0,9995) = 96: 2260,9248 − 2,2609248; 7641,33612743 + 2258,6638752.
    const result = handStep({ state: carriedWallet(), candle: ['100', '101', '95', '96'] });
    expect(result.decisions.closedPositions[0]).toMatchObject({ exitReason: 'stop' });
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '9900.00000263',
      equityAtLow: '9900.00000263',
    });
  });

  test('a position sold by a pending order at the open is not held at the low', () => {
    // Sai na abertura a 99,95 (2353,952435 − 2,35395244): o patrimônio é só o caixa.
    const result = handStep({
      state: carriedWallet({ pendingOrder: PENDING_SIGNAL_EXIT }),
      candle: ['100', '101', '90', '100'],
    });
    expect(result.decisions.closedPositions[0]).toMatchObject({ exitReason: 'signal' });
    expect(result.decisions.equityPoint).toMatchObject({
      equity: '9992.93460999',
      equityAtLow: '9992.93460999',
    });
  });
});
