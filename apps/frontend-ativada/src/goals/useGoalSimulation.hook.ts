// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useNavigate } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { RUN_KIND } from '../runs/run.constant.js';
import { useCreateRunMutation } from '../runs/runs.query.js';
import { messageFromGoalError } from './goal-form.validation.js';
import type { Combination } from './goal.validation.js';
import type { SimulationTimeframe } from './simulation-timeframe.constant.js';

const ANALYST_MODE_SHADOW = 'shadow';

export type GoalSimulation = {
  readonly isPending: boolean;
  readonly message: string | undefined;
  readonly simulate: (combination: Combination) => void;
};

// A vela é por simulação (`runs.timeframe`); a meta e o ranking não mudam.
export function useGoalSimulation(
  goalId: string,
  timeframe: SimulationTimeframe,
  hasAnalyst = false,
): GoalSimulation {
  const navigate = useNavigate();
  const create = useCreateRunMutation();
  return {
    isPending: create.isPending,
    message: messageFromGoalError(create.error),
    simulate: (combination) =>
      create.mutate(
        {
          strategyVersionId: combination.strategy.versionId,
          kind: RUN_KIND.LIVE_PAPER,
          symbol: combination.symbol,
          timeframe,
          goalId,
          // O analista de risco só observa (modo sombra) e só existe com a vela de 15 min.
          ...(hasAnalyst ? { analyst: { mode: ANALYST_MODE_SHADOW } } : {}),
        },
        { onSuccess: () => void navigate(ROUTE_PATH.OVERVIEW) },
      ),
  };
}
