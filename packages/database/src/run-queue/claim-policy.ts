// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '../runs/run.constant.js';
import type { UserRunLimits } from './run-limits.js';

// A cabeça da fila de um usuário para um tipo: a execução `queued` mais antiga dele daquele tipo.
export type ClaimCandidate = {
  readonly runId: string;
  readonly userId: string;
  readonly kind: RunKind;
  readonly createdMicros: bigint;
  // Quando o usuário foi servido pela última vez (qualquer tipo); `undefined` se nunca.
  readonly lastStartedMicros: bigint | undefined;
  readonly runningOfKind: number;
  readonly limits: UserRunLimits;
};

// Teto POR USUÁRIO e por tipo: o walk-forward do mesmo dono espera, o de outro dono roda.
export function hasCapacity(candidate: ClaimCandidate): boolean {
  if (candidate.kind === RUN_KIND.BACKTEST) {
    return candidate.runningOfKind < candidate.limits.maxConcurrentBacktests;
  }
  if (candidate.kind === RUN_KIND.WALK_FORWARD) {
    return candidate.runningOfKind < candidate.limits.maxConcurrentWalkForwards;
  }
  return false;
}

function compareBigint(first: bigint, second: bigint): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function compareText(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

// ROUND-ROBIN entre usuários: quem nunca foi servido vem primeiro; depois, quem foi servido há mais tempo; dentro do
// mesmo instante, a fila mais antiga e, por fim, o id. Um usuário com 10 na fila não passa na frente de quem chegou
// depois e ainda não começou nenhuma.
export function compareClaimCandidates(first: ClaimCandidate, second: ClaimCandidate): number {
  const firstServed = first.lastStartedMicros;
  const secondServed = second.lastStartedMicros;
  if (firstServed !== secondServed) {
    if (firstServed === undefined) return -1;
    if (secondServed === undefined) return 1;
    return compareBigint(firstServed, secondServed);
  }
  return (
    compareBigint(first.createdMicros, second.createdMicros) ||
    compareText(first.runId, second.runId)
  );
}
