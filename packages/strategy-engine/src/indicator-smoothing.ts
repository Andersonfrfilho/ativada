// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readNullableNumber, readNumberArray, readRecord } from './indicator-snapshot.js';
import { sumOf } from './indicator-statistics.js';
import type { JsonValue } from './json-value.types.js';

// Suavização com semente: as `period` primeiras entradas dão a média simples (o valor sai no
// `period`-ésimo); depois `y = y₋₁ + peso·(x − y₋₁)`. EMA usa peso 2/(n+1); Wilder, 1/n (ADR 0002).
export type SmootherState = {
  readonly seed: readonly number[];
  readonly value: number | null;
};

export const INITIAL_SMOOTHER_STATE: SmootherState = { seed: [], value: null };

export type AdvanceSmootherParams = {
  readonly state: SmootherState;
  readonly input: number;
  readonly period: number;
  readonly weight: number;
};

export function exponentialWeight(period: number): number {
  return 2 / (period + 1);
}

export function wilderWeight(period: number): number {
  return 1 / period;
}

export function advanceSmoother(params: AdvanceSmootherParams): SmootherState {
  const { state, input, period, weight } = params;
  if (state.value !== null) {
    return { seed: [], value: state.value + weight * (input - state.value) };
  }
  const seed = [...state.seed, input];
  if (seed.length < period) return { seed, value: null };
  return { seed: [], value: sumOf(seed) / period };
}

export function parseSmootherState(snapshot: JsonValue | undefined, period: number): SmootherState {
  const record = readRecord(snapshot);
  const seed = readNumberArray({ record, key: 'seed', maximumLength: period });
  const value = readNullableNumber(record, 'value');
  return { seed, value };
}
