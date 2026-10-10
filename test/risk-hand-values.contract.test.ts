// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computePositionSize,
  computeProtectivePrices,
  type ComputeProtectivePricesParams,
  type PositionSizeParams,
} from '../packages/strategy-engine/src/index.js';

// Base de todas as contas à mão: P = 100,05; stop = 96,05; taxa 0,1%; slippage 0,05%; tick 0,01;
// passo 0,001. Saída estimada X = tickDown(96,05 × 0,9995) = tickDown(96,001975) = 96,00.
// Risco por unidade = (P − X) + P·taxa + X·taxa = 4,05 + 0,10005 + 0,096 = 4,24605.
const BASE: PositionSizeParams = {
  riskAmount: '100',
  entryPrice: '100.05',
  stopPrice: '96.05',
  feeRate: '0.001',
  slippageRate: '0.0005',
  cash: '10000',
  equity: '10000',
  maxExposureRate: '1',
  candleVolume: '1000000000',
  maxVolumeShare: '0.01',
  quantityStep: '0.001',
  tickSize: '0.01',
  minNotional: '5',
};

const PROTECTIVE_BASE: ComputeProtectivePricesParams = {
  entryPrice: '100.05',
  atr: '2',
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  slippageRate: '0.0005',
  tickSize: '0.01',
};

describe('position size: figures worked out by hand', () => {
  test('1. limited by the value at risk', () => {
    // 100 ÷ 4,24605 = 23,5513… → 23,551. Valor = 23,551 × 100,05 = 2.356,27755.
    // Débito = 2.356,27755 + taxa 2,35627755 = 2.358,63382755.
    // Crédito = 23,551 × 96 = 2.260,896 − taxa 2,260896 = 2.258,635104. Perda = 99,99872355 ≤ 100.
    expect(computePositionSize(BASE)).toStrictEqual({
      quantity: '23.551',
      notional: '2356.27755',
      estimatedStopLoss: '99.99872355',
      constraint: 'none',
    });
  });

  test('2. limited by the exposure ceiling', () => {
    // Teto = 0,1 × 10.000 = 1.000; 1.000 ÷ 100,05 = 9,99500… → 9,995. Valor = 999,99975.
    // Débito = 999,99975 + 0,99999975 = 1.000,99974975. Crédito = 959,52 − 0,95952 = 958,56048.
    // Perda = 42,43926975.
    expect(computePositionSize({ ...BASE, maxExposureRate: '0.1' })).toStrictEqual({
      quantity: '9.995',
      notional: '999.99975',
      estimatedStopLoss: '42.43926975',
      constraint: 'exposure_capped',
    });
  });

  test('3. limited by the cash (the fee has to fit too)', () => {
    // Caixa 500: 500 ÷ 1,001 = 499,5004995; ÷ 100,05 = 4,99250… → 4,992 (a exposição daria 4,997).
    // Valor = 499,4496; débito = 499,4496 + 0,4994496 = 499,9490496 ≤ 500.
    // Crédito = 479,232 − 0,479232 = 478,752768. Perda = 21,1962816.
    expect(computePositionSize({ ...BASE, cash: '500', equity: '500' })).toStrictEqual({
      quantity: '4.992',
      notional: '499.4496',
      estimatedStopLoss: '21.1962816',
      constraint: 'cash_capped',
    });
  });

  test('4. limited by the volume share of the DECISION candle', () => {
    // 1% de 300 = 3 → 3,000. Valor = 300,15; débito = 300,15 + 0,30015 = 300,45015.
    // Crédito = 288 − 0,288 = 287,712. Perda = 12,73815.
    expect(computePositionSize({ ...BASE, candleVolume: '300' })).toStrictEqual({
      quantity: '3',
      notional: '300.15',
      estimatedStopLoss: '12.73815',
      constraint: 'volume_capped',
    });
  });

  test('5. below the minimum notional: 0,1 of risk buys 0,023 (2,30115 < 5)', () => {
    // 0,1 ÷ 4,24605 = 0,02355 → 0,023; 0,023 × 100,05 = 2,30115 < 5.
    expect(computePositionSize({ ...BASE, riskAmount: '0.1' })).toStrictEqual({
      quantity: '0',
      notional: '0',
      estimatedStopLoss: '0',
      constraint: 'below_min_notional',
    });
  });

  test('6. a volume that rounds to zero steps is below the minimum too', () => {
    // 1% de 0,01 = 0,0001 → passo 0,001 → 0.
    expect(computePositionSize({ ...BASE, candleVolume: '0.01' }).constraint).toBe(
      'below_min_notional',
    );
  });

  test('7. stop at or above P × (1 − slippage) is invalid', () => {
    // P × (1 − s) = 100,05 × 0,9995 = 99,999975; stop 100 ≥ 99,999975. Stop zero também.
    expect(computePositionSize({ ...BASE, stopPrice: '100' }).constraint).toBe('invalid_stop');
    expect(computePositionSize({ ...BASE, stopPrice: '0' }).constraint).toBe('invalid_stop');
  });

  test('8. zero value at risk', () => {
    expect(computePositionSize({ ...BASE, riskAmount: '0' }).constraint).toBe('zero_risk');
  });

  test('9. a coarser step: 100 ÷ 4,24605 = 23,55 → 23 whole units', () => {
    // Valor = 23 × 100,05 = 2.301,15; débito = 2.301,15 + 2,30115 = 2.303,45115.
    // Crédito = 2.208 − 2,208 = 2.205,792. Perda = 97,65915.
    expect(computePositionSize({ ...BASE, quantityStep: '1' })).toStrictEqual({
      quantity: '23',
      notional: '2301.15',
      estimatedStopLoss: '97.65915',
      constraint: 'none',
    });
  });
});

describe('protective prices: figures worked out by hand', () => {
  test('stop = P − k·ATR and target = P + m·ATR on the tick', () => {
    // 100,05 − 2 × 2 = 96,05; 100,05 + 3 × 2 = 106,05; ambos já no tick de 0,01.
    expect(computeProtectivePrices(PROTECTIVE_BASE)).toStrictEqual({
      kind: 'priced',
      stopPrice: '96.05',
      targetPrice: '106.05',
      stopDistance: '4',
      targetDistance: '6',
    });
  });

  test('the stop goes DOWN and the target UP to the tick', () => {
    // Tick 0,1: 96,05 ÷ 0,1 = 960,5 → 960 → 96; 106,05 ÷ 0,1 = 1060,5 → 1061 → 106,1.
    expect(computeProtectivePrices({ ...PROTECTIVE_BASE, tickSize: '0.1' })).toMatchObject({
      kind: 'priced',
      stopPrice: '96',
      targetPrice: '106.1',
    });
  });

  test('refuses with a typed reason', () => {
    const refusal = (overrides: Partial<ComputeProtectivePricesParams>): unknown =>
      computeProtectivePrices({ ...PROTECTIVE_BASE, ...overrides });
    // ATR zero.
    expect(refusal({ atr: '0' })).toStrictEqual({ kind: 'refused', reason: 'zero_atr' });
    // 100,05 − 2 × 60 < 0.
    expect(refusal({ atr: '60' })).toStrictEqual({ kind: 'refused', reason: 'invalid_stop' });
    // 100,05 − 4 × 24,99 = 0,09 → tick 0,1 → 0: abaixo do tick mínimo.
    expect(refusal({ atr: '24.99', stopAtrMultiple: '4', tickSize: '0.1' })).toStrictEqual({
      kind: 'refused',
      reason: 'stop_below_tick',
    });
    // Stop 100,03 ≥ 99,999975: o slippage de saída come a distância.
    expect(refusal({ atr: '0.01' })).toStrictEqual({ kind: 'refused', reason: 'invalid_stop' });
  });
});
