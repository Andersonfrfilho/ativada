// Copyright (c) 2026 Ada Technology. All rights reserved.

// Janelas finitas são RECALCULADAS a cada candle (ADR 0002 §c): nada de somatório corrido.
export function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function averageOf(values: readonly number[]): number {
  return sumOf(values) / values.length;
}

export type SlideWindowParams = {
  readonly window: readonly number[];
  readonly value: number;
  readonly size: number;
};

export function slideWindow(params: SlideWindowParams): readonly number[] {
  return [...params.window, params.value].slice(-params.size);
}

export type WindowStatistics = {
  readonly mean: number;
  readonly deviation: number;
};

// Desvio POPULACIONAL (divisor n), em duas passagens. Janela de valores iguais tem desvio exatamente
// 0: a média de decimais repetidos (0.1 vinte vezes) erraria 1 ulp e o z-score viraria ±1.
export function windowStatistics(window: readonly number[]): WindowStatistics {
  const first = window[0];
  if (first !== undefined && window.every((value) => value === first)) {
    return { mean: first, deviation: 0 };
  }
  const mean = averageOf(window);
  const squares = window.map((value) => (value - mean) * (value - mean));
  return { mean, deviation: Math.sqrt(sumOf(squares) / window.length) };
}
