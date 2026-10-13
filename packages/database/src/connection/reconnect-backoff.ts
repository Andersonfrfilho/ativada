// Copyright (c) 2026 Ada Technology. All rights reserved.

export type ComputeBackoffParams = {
  // 1 na primeira falha da queda.
  readonly attempt: number;
  readonly baseMilliseconds: number;
  readonly maxMilliseconds: number;
  // O sorteio em [0, 1] entra pronto: a conta não conhece `Math.random`.
  readonly random: number;
};

// A mesma conta do escutador de NOTIFY: degrau c = min(base x 2^(attempt - 1), teto) e espera sorteada em [c/2, c].
export function computeBackoff(params: ComputeBackoffParams): number {
  const step = Math.max(1, Math.floor(params.attempt));
  const ceiling = Math.min(params.baseMilliseconds * 2 ** (step - 1), params.maxMilliseconds);
  const draw = Math.min(1, Math.max(0, params.random));
  return Math.round(ceiling / 2 + (ceiling / 2) * draw);
}
