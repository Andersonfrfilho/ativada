// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionRepository, OwnerScope } from '@ativada/database';
import { ANALYST_VERSION, GOVERN_MODE_MESSAGE, SHADOW_MODE_MESSAGE } from '@ativada/risk-analyst';

import {
  readLiveContext,
  type LiveStatusRunDependencies,
} from '../live-status/live-status-context.js';
import { resolveCurrent } from './analyst-current.js';
import { buildAnalystGoalProgress } from './analyst-goal-progress.js';
import { findAnalystRun } from './analyst-run.js';
import { toDecidedAnalystView } from './analyst-view.js';
import { ANALYST_DECISION_STATUS, ANALYST_MODE } from './analyst.constant.js';
import type { AnalystView } from './analyst.schema.js';

export type AnalystDependencies = LiveStatusRunDependencies & {
  readonly analyst: Pick<
    AnalystDecisionRepository,
    'findLatestAnalystDecision' | 'readAnalystGoalSnapshot'
  >;
  readonly now: () => number;
};

export type AnalystUseCase = (scope: OwnerScope, runId: string) => Promise<AnalystView>;

// O analista agora, numa ida só ao servidor (spec 007, A20): a execução, depois a versão da estratégia, a última decisão e,
// com meta, o patrimônio e as operações fechadas: no máximo quatro consultas por chave, nada recalculado por pedido.
export function createAnalystUseCase(dependencies: AnalystDependencies): AnalystUseCase {
  return async (scope, runId) => {
    const { run, mode } = await findAnalystRun(dependencies, { scope, runId });
    const [context, latest, snapshot] = await Promise.all([
      readLiveContext(dependencies, { scope, run }),
      dependencies.analyst.findLatestAnalystDecision(scope, run.id),
      run.goalId === undefined
        ? undefined
        : dependencies.analyst.readAnalystGoalSnapshot(scope, run.id),
    ]);
    const decided =
      latest?.status === ANALYST_DECISION_STATUS.DECIDED
        ? toDecidedAnalystView({
            record: latest,
            riskPerTrade: context.config.risk.riskPerTrade,
            durationMilliseconds: context.durationMilliseconds,
          })
        : undefined;
    return {
      version: ANALYST_VERSION,
      mode,
      modeMessage: mode === ANALYST_MODE.SHADOW ? SHADOW_MODE_MESSAGE : GOVERN_MODE_MESSAGE,
      current: resolveCurrent({ run, latest, decided }),
      goalProgress: buildAnalystGoalProgress({
        run,
        initialBalance: context.parameters.initialBalance,
        snapshot,
        now: dependencies.now(),
      }),
      locks: decided?.locks ?? [],
    };
  };
}
