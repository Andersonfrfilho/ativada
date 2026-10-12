// Copyright (c) 2026 Ada Technology. All rights reserved.

export type BackoffParams = {
  readonly attempt: number;
  readonly baseMilliseconds: number;
  readonly maxMilliseconds: number;
  readonly random: () => number;
};

// Jitter "equal": metade fixa e metade aleatória, então nunca há espera abaixo de base/2.
export function computeBackoffDelay(params: BackoffParams): number {
  const capped = Math.min(params.baseMilliseconds * 2 ** params.attempt, params.maxMilliseconds);
  return Math.round(capped / 2 + (capped / 2) * params.random());
}
