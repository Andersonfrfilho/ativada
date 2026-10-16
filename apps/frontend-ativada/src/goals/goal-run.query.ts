// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { RUN_STATUS } from '../overview/overview.constant.js';
import { useLiveRunsPageOptions } from '../overview/overview.query.js';
import type { Run } from '../overview/overview.validation.js';

const ACTIVE_STATUSES: readonly string[] = [RUN_STATUS.RUNNING, RUN_STATUS.QUEUED];

function pickGoalRun(runs: readonly Run[]): Run | null {
  const withGoal = runs.filter((run) => run.goalId !== null && run.goalId !== undefined);
  return withGoal.find((run) => ACTIVE_STATUSES.includes(run.status)) ?? withGoal[0] ?? null;
}

// A simulação ligada a uma meta que o painel mostra: a ativa, ou a mais recente já encerrada (com o desfecho).
// Divide o pedido com a Visão geral (mesma chave): só o `select` muda.
export function useGoalRunQuery(): UseQueryResult<Run | null> {
  return useQuery({ ...useLiveRunsPageOptions(), select: pickGoalRun });
}
