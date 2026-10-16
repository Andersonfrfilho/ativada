// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { joinSimulations, type LiveSimulation } from './live-simulations.js';
import { useLiveSummaryQuery } from './live-summary.query.js';
import type { LiveSummaryItem } from './live-summary.validation.js';
import { useLiveRunsPageOptions } from './overview.query.js';
import type { Run } from './overview.validation.js';

export type LiveSimulations = {
  readonly simulations: LiveSimulation[];
  readonly runs: UseQueryResult<Run[]>;
  readonly summary: UseQueryResult<LiveSummaryItem[]>;
};

// Duas consultas para TODAS as simulações: a página compartilhada de `live_paper` (a mesma da meta e da lista de metas) e o
// resumo agregado. Nenhuma por linha.
export function useLiveSimulations(): LiveSimulations {
  const runs = useQuery(useLiveRunsPageOptions());
  const summary = useLiveSummaryQuery();
  return {
    simulations: joinSimulations(runs.data ?? [], summary.data ?? []),
    runs,
    summary,
  };
}
