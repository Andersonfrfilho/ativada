// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useProfileQuery } from '../account/account.query.js';
import { useActiveLiveRunsQuery } from './live-runs.query.js';
import type { Combination } from './goal.validation.js';
import {
  DEFAULT_LIVE_RUN_LIMIT,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';

export type LiveRunSlots = {
  readonly count: number;
  readonly limit: number;
  readonly isAtLimit: boolean;
  // Mesma estratégia (versão), par e vela já ativos: só avisa, nunca bloqueia (D4).
  readonly findDuplicateRunId: (
    combination: Combination,
    timeframe: SimulationTimeframe,
  ) => string | undefined;
};

export function useLiveRunSlots(): LiveRunSlots {
  const runs = useActiveLiveRunsQuery().data ?? [];
  const limit = useProfileQuery().data?.limits?.maxActiveLivePaperRuns ?? DEFAULT_LIVE_RUN_LIMIT;
  return {
    count: runs.length,
    limit,
    isAtLimit: runs.length >= limit,
    findDuplicateRunId: (combination, timeframe) =>
      runs.find(
        (run) =>
          run.strategyVersionId === combination.strategy.versionId &&
          run.symbol === combination.symbol &&
          run.timeframe === timeframe,
      )?.id,
  };
}
