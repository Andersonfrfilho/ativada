// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import {
  PAGE_SIZE,
  RUN_KIND_LIVE_PAPER,
  RUN_STATUS,
  STALE_TIME_MILLISECONDS,
} from '../overview/overview.constant.js';
import { runSchema, type Run } from '../overview/overview.validation.js';

const ACTIVE_STATUSES: readonly string[] = [RUN_STATUS.RUNNING, RUN_STATUS.QUEUED];

// A simulação ligada a uma meta que o painel mostra: a ativa, ou a mais recente já encerrada (com o desfecho).
export function useGoalRunQuery(): UseQueryResult<Run | null> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', 'goal'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const query = new URLSearchParams({ kind: RUN_KIND_LIVE_PAPER, limit: String(PAGE_SIZE) });
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}?${query.toString()}`,
        schema: runSchema,
      });
      const withGoal = page.items.filter((run) => run.goalId !== null && run.goalId !== undefined);
      return withGoal.find((run) => ACTIVE_STATUSES.includes(run.status)) ?? withGoal[0] ?? null;
    },
  });
}
