// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type OwnerScope,
  type RunKind,
  type RunQueueRepository,
} from '@ativada/database';

import {
  LiveRunLimitReachedError,
  RunQueueFullError,
  RunStorageQuotaReachedError,
} from './run.error.js';

export type RunAdmissionDependencies = {
  readonly queue: Pick<
    RunQueueRepository,
    'countQueuedRuns' | 'countActiveRuns' | 'countStoredRuns' | 'readUserRunLimits'
  >;
  readonly queuePerUserLimit: number;
  // Teto de execuções guardadas por usuário (qualquer tipo e estado, menos as apagadas).
  readonly runStorageLimit: number;
};

export type AdmitRunParams = {
  readonly scope: OwnerScope;
  readonly kind: RunKind;
};

// Os tetos de uso por usuário (RF00b), conferidos ANTES de criar qualquer linha. A simulação ao vivo é medida pelas
// ativas contra `users.limits`; backtest e walk-forward entram na fila do usuário, que tem um teto de execuções esperando.
export async function admitRun(
  dependencies: RunAdmissionDependencies,
  params: AdmitRunParams,
): Promise<void> {
  const { queue } = dependencies;
  if ((await queue.countStoredRuns(params.scope)) >= dependencies.runStorageLimit) {
    throw new RunStorageQuotaReachedError();
  }
  if (params.kind === RUN_KIND.LIVE_PAPER) {
    const [active, limits] = await Promise.all([
      queue.countActiveRuns(params.scope, RUN_KIND.LIVE_PAPER),
      queue.readUserRunLimits(params.scope),
    ]);
    if (active >= limits.maxActiveLivePaperRuns) throw new LiveRunLimitReachedError();
    return;
  }
  const queued = await queue.countQueuedRuns(params.scope);
  if (queued >= dependencies.queuePerUserLimit) throw new RunQueueFullError();
}
