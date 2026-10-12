// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus } from '@ativada/database';

import { buildReport } from './build-report.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_PHASE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { WalkForwardDeps } from './walk-forward-deps.js';
import type { WalkForwardCompleted } from './walk-forward.types.js';

export type FinishResult =
  | { readonly kind: 'completed'; readonly outcome: WalkForwardCompleted }
  | { readonly kind: 'stopped'; readonly status: RunStatus };

// As métricas saem do que ficou GRAVADO (janelas e curva de patrimônio dos testes), não de um acumulador da
// memória: uma execução retomada e uma contínua passam pelo mesmo caminho e dão o mesmo resultado.
export async function finishWalkForward(deps: WalkForwardDeps): Promise<FinishResult> {
  const { session, context } = deps;
  const report = await deps.timer.measure(WALK_FORWARD_PHASE.REPORT, async () =>
    buildReport({
      windows: await session.readWindows(),
      equityPoints: await session.readEquityPoints(),
      run: {
        initialBalance: deps.setup.parameters.initialBalance,
        timeframeMilliseconds: context.durationMilliseconds,
      },
      combinations: context.combinations.length,
    }),
  );
  if (!(await session.completeRun(report.stored))) {
    const status = (await session.readStatus()) ?? RUN_STATUS.FAILED;
    if (status === RUN_STATUS.CANCELLED) return { kind: 'stopped', status };
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.RUN_NOT_RUNNABLE,
      'A execução já foi encerrada.',
    );
  }
  return {
    kind: 'completed',
    outcome: {
      status: 'completed',
      runId: context.run.id,
      windows: context.windows.length,
      combinations: context.combinations.length,
      candles: deps.series.candles.length,
      overfitting: report.overfitting,
      metrics: report.stored,
      phases: deps.timer.totals(),
    },
  };
}
