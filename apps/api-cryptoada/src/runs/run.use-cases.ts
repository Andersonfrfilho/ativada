// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
  type OwnerScope,
  type RunCursor,
  type RunKind,
  type RunRepository,
} from '@cryptoada/database';

import type { PageOutput } from '../strategies/strategy.use-cases.js';
import { RunAlreadyFinishedError, RunNotFoundError } from './run.error.js';
import { readQueuePosition, type RunQueuePositionDependencies } from './run-queue-position.js';
import { encodeRunCursor } from './run-cursor.js';
import { toRunView, type RunDetailView, type RunView } from './run-view.js';
import { readRunSurvival, type RunSurvivalDependencies } from './run-survival.js';
import { readRunWarnings, type RunWarningDependencies } from './run-warnings.js';

export type RunUseCaseDependencies = RunWarningDependencies &
  RunQueuePositionDependencies &
  RunSurvivalDependencies & {
    readonly runs: Pick<RunRepository, 'findRun' | 'listRuns' | 'transitionRun'>;
  };

export type ListRunsInput = {
  readonly limit: number;
  readonly after: RunCursor | undefined;
  readonly kind: RunKind | undefined;
};

export type StoppedRun = { readonly id: string; readonly status: RunView['status'] };

export type GetRunUseCase = (scope: OwnerScope, runId: string) => Promise<RunDetailView>;
export type ListRunsUseCase = (
  scope: OwnerScope,
  input: ListRunsInput,
) => Promise<PageOutput<RunView>>;
export type StopRunUseCase = (scope: OwnerScope, runId: string) => Promise<StoppedRun>;

export function createGetRunUseCase(dependencies: RunUseCaseDependencies): GetRunUseCase {
  return async (scope, runId) => {
    const run = await dependencies.runs.findRun(scope, runId);
    if (run === undefined) throw new RunNotFoundError();
    return {
      ...toRunView(run),
      warnings: await readRunWarnings(dependencies, run),
      queuePosition: await readQueuePosition(dependencies, scope, run),
      survival: await readRunSurvival(dependencies, { scope, run }),
    };
  };
}

export function createListRunsUseCase(dependencies: RunUseCaseDependencies): ListRunsUseCase {
  return async (scope, input) => {
    const page = await dependencies.runs.listRuns(scope, input);
    return {
      items: page.runs.map(toRunView),
      nextCursor: page.nextCursor === undefined ? null : encodeRunCursor(page.nextCursor),
      perPage: input.limit,
    };
  };
}

// Cancela `queued` ou `running` de qualquer tipo. Já cancelada responde igual (idempotente); concluída ou falha
// não volta atrás: 409. Recurso de outro dono é o mesmo `RUN_NOT_FOUND` do inexistente.
export function createStopRunUseCase(dependencies: RunUseCaseDependencies): StopRunUseCase {
  return async (scope, runId) => {
    const result = await dependencies.runs.transitionRun(scope, {
      runId,
      to: RUN_STATUS.CANCELLED,
    });
    if (result.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED) {
      return { id: result.run.id, status: result.run.status };
    }
    if (result.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND) throw new RunNotFoundError();
    if (result.currentStatus !== RUN_STATUS.CANCELLED) throw new RunAlreadyFinishedError();
    return { id: runId, status: RUN_STATUS.CANCELLED };
  };
}
