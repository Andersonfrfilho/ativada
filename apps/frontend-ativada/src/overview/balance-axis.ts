// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPoint } from './overview.validation.js';

export type BalanceExtremes = { readonly maxText: string; readonly minText: string };

const STEP_LABEL: Readonly<Record<string, string>> = {
  '15m': 'a cada 15 min',
  '1h': 'hora a hora',
  '4h': 'a cada 4 horas',
  '1d': 'dia a dia',
};

// "Saldo hora a hora": o título acompanha o tamanho da vela da simulação.
export function describeBalanceSteps(timeframe: string): string {
  return STEP_LABEL[timeframe] ?? 'vela a vela';
}

// Os textos decimais do maior e do menor valor entre a curva e comprar e segurar: o eixo mostra o número exato, sem refazer a conta.
export function findBalanceExtremes(points: readonly EquityPoint[]): BalanceExtremes | undefined {
  const values = points.flatMap((point) => [point.equity, point.benchmark]);
  const first = values[0];
  if (first === undefined) return undefined;
  let maxText = first;
  let minText = first;
  for (const value of values) {
    if (Number(value) > Number(maxText)) maxText = value;
    if (Number(value) < Number(minText)) minText = value;
  }
  return { maxText, minText };
}
