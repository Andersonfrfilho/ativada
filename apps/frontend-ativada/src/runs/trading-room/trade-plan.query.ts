// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import { tradePlanSchema, type TradePlan } from './trade-plan.validation.js';

// Sob a raiz `runs`, como o `live-status`: o aviso do stream ao vivo refaz o plano junto com a execução.
export function useTradePlanQuery(runId: string, isEnabled: boolean): UseQueryResult<TradePlan> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'trade-plan'],
    enabled: isEnabled,
    queryFn: () =>
      client.request({ path: `${API_PATH.RUNS}/${runId}/trade-plan`, schema: tradePlanSchema }),
  });
}
