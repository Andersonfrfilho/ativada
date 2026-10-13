// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useActiveLiveRunsQuery } from './live-runs.query.js';
import type { Combination } from './goal.validation.js';
import { LIVE_RUN_LIMIT, type SimulationTimeframe } from './simulation-timeframe.constant.js';

export type LiveRunSlots = {
  readonly count: number;
  readonly isAtLimit: boolean;
  // Mesma estratégia (versão), par e vela já ativos: só avisa, nunca bloqueia (D4).
  readonly findDuplicateRunId: (
    combination: Combination,
    timeframe: SimulationTimeframe,
  ) => string | undefined;
};

export function useLiveRunSlots(): LiveRunSlots {
  const runs = useActiveLiveRunsQuery().data ?? [];
  return {
    count: runs.length,
    isAtLimit: runs.length >= LIVE_RUN_LIMIT,
    findDuplicateRunId: (combination, timeframe) =>
      runs.find(
        (run) =>
          run.strategyVersionId === combination.strategy.versionId &&
          run.symbol === combination.symbol &&
          run.timeframe === timeframe,
      )?.id,
  };
}
