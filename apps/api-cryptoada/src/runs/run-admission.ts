// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type OwnerScope,
  type RunKind,
  type RunQueueRepository,
} from '@cryptoada/database';

import { LiveRunLimitReachedError, RunQueueFullError } from './run.error.js';

export type RunAdmissionDependencies = {
  readonly queue: Pick<
    RunQueueRepository,
    'countQueuedRuns' | 'countActiveRuns' | 'readUserRunLimits'
  >;
  readonly queuePerUserLimit: number;
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
