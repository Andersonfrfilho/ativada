// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { MetricValue, OverfittingWindow } from '../packages/strategy-engine/src/index.js';
import { loadWalkForwardEngineApi } from './fixtures/walk-forward/walk-forward-api.fixture.js';

const {
  detectOverfitting,
  MIN_ELIGIBLE_WINDOW_FRACTION,
  OVERFITTING_DEGRADATION_LIMIT,
  OVERFITTING_REASON,
} = await loadWalkForwardEngineApi();

function window(sharpe: string | null, weight: number, isEligible = true): OverfittingWindow {
  return { isEligible, inSampleSharpe: sharpe, weight };
}

function sharpeValue(value: string): MetricValue {
  return { value, reason: null };
}

const OOS_UNDEFINED = { value: null, reason: 'zero_volatility' } as const;

describe('constantes documentadas', () => {
  test('limiar de 50% e fração mínima de janelas elegíveis', () => {
    expect(OVERFITTING_DEGRADATION_LIMIT).toBe('0.5');
    expect(MIN_ELIGIBLE_WINDOW_FRACTION).toBe('0.5');
  });
});

describe('degradação fora da amostra', () => {
  test('0,99 contra 2,0 é 49,5% e dispara; 1,0 contra 2,0 é exatamente 50% e NÃO dispara', () => {
    const windows = [window('2', 1), window('2', 1)];
    const below = detectOverfitting({ windows, outOfSampleSharpe: sharpeValue('0.99') });
    expect(below.isAlert).toBe(true);
    expect(below.reasons).toEqual([OVERFITTING_REASON.SHARPE_BELOW_HALF_OF_IN_SAMPLE]);
    expect(below.inSampleSharpe).toEqual({ value: '2', reason: null });
    expect(below.degradation).toEqual({ value: '0.495', reason: null });
    const exact = detectOverfitting({ windows, outOfSampleSharpe: sharpeValue('1') });
    expect(exact.isAlert).toBe(false);
    expect(exact.reasons).toEqual([]);
    expect(exact.degradation).toEqual({ value: '0.5', reason: null });
  });

  test('fora da amostra NEGATIVO com dentro positivo dispara pelos dois motivos', () => {
    const result = detectOverfitting({
      windows: [window('1.2', 2), window('0.8', 2)],
      outOfSampleSharpe: sharpeValue('-0.1'),
    });
    expect(result.isAlert).toBe(true);
    expect(result.reasons).toEqual([
      OVERFITTING_REASON.SHARPE_BELOW_HALF_OF_IN_SAMPLE,
      OVERFITTING_REASON.NEGATIVE_OUT_OF_SAMPLE_WITH_POSITIVE_IN_SAMPLE,
    ]);
  });

  test('fora da amostra melhor que dentro não dispara', () => {
    const result = detectOverfitting({
      windows: [window('1', 1), window('1', 1)],
      outOfSampleSharpe: sharpeValue('1.4'),
    });
    expect(result).toMatchObject({ isAlert: false, reasons: [] });
    expect(result.degradation).toEqual({ value: '1.4', reason: null });
  });

  test('média PONDERADA pelas janelas elegíveis: (3×1 + 1×3) ÷ 4 = 1,5', () => {
    const result = detectOverfitting({
      windows: [window('3', 1), window('1', 3), window('99', 50, false)],
      outOfSampleSharpe: sharpeValue('1.5'),
    });
    expect(result.inSampleSharpe).toEqual({ value: '1.5', reason: null });
    expect(result.eligibleWindows).toBe(2);
    expect(result.totalWindows).toBe(3);
  });

  test('dentro da amostra não positivo: sem razão definida, não dispara por degradação', () => {
    const result = detectOverfitting({
      windows: [window('-0.4', 1), window('0.4', 1)],
      outOfSampleSharpe: sharpeValue('-1'),
    });
    expect(result.inSampleSharpe).toEqual({ value: '0', reason: null });
    expect(result.degradation).toEqual({ value: null, reason: 'non_positive_in_sample' });
    expect(result.isAlert).toBe(false);
  });

  test('janelas sem Sharpe dentro da amostra não pesam na média', () => {
    const result = detectOverfitting({
      windows: [window('2', 1), window(null, 100)],
      outOfSampleSharpe: sharpeValue('2'),
    });
    expect(result.inSampleSharpe.value).toBe('2');
  });
});

describe('janelas elegíveis e Sharpe fora da amostra indefinido', () => {
  test('menos da metade das janelas elegíveis dispara; exatamente a metade não', () => {
    const one = detectOverfitting({
      windows: [window('2', 1), window(null, 1, false), window(null, 1, false)],
      outOfSampleSharpe: sharpeValue('2'),
    });
    expect(one.isAlert).toBe(true);
    expect(one.reasons).toEqual([OVERFITTING_REASON.TOO_FEW_ELIGIBLE_WINDOWS]);
    const half = detectOverfitting({
      windows: [window('2', 1), window('2', 1), window(null, 1, false), window(null, 1, false)],
      outOfSampleSharpe: sharpeValue('2'),
    });
    expect(half.isAlert).toBe(false);
  });

  test('nenhuma janela elegível: alerta, e o dentro da amostra é indefinido', () => {
    const result = detectOverfitting({
      windows: [window(null, 1, false), window(null, 1, false), window(null, 1, false)],
      outOfSampleSharpe: OOS_UNDEFINED,
    });
    expect(result.isAlert).toBe(true);
    expect(result.reasons).toContain(OVERFITTING_REASON.TOO_FEW_ELIGIBLE_WINDOWS);
    expect(result.inSampleSharpe).toEqual({ value: null, reason: 'no_eligible_windows' });
    expect(result.outOfSampleSharpe).toEqual(OOS_UNDEFINED);
  });

  test('fora da amostra indefinido com dentro positivo dispara (não dá para confirmar o ganho)', () => {
    const result = detectOverfitting({
      windows: [window('1.5', 1), window('1.5', 1)],
      outOfSampleSharpe: OOS_UNDEFINED,
    });
    expect(result.isAlert).toBe(true);
    expect(result.reasons).toEqual([OVERFITTING_REASON.OUT_OF_SAMPLE_UNDEFINED]);
    expect(result.degradation).toEqual({ value: null, reason: 'undefined_out_of_sample' });
  });

  test('é puro: a mesma entrada dá a mesma saída e não muta a lista', () => {
    const windows = Object.freeze([window('2', 1), window('1', 3)]);
    const first = detectOverfitting({ windows, outOfSampleSharpe: sharpeValue('0.3') });
    expect(detectOverfitting({ windows, outOfSampleSharpe: sharpeValue('0.3') })).toEqual(first);
  });
});
