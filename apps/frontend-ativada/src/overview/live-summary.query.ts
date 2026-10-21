// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { STALE_TIME_MILLISECONDS } from './overview.constant.js';
import { liveSummarySchema, type LiveSummaryItem } from './live-summary.validation.js';

// Uma consulta para TODAS as simulações ao vivo ativas (saldo, resultado, operações, última decisão): nunca um
// `live-status` por linha, que estouraria o limite de pedidos. Fica sob a raiz `runs`, então o aviso do stream a refaz.
export function useLiveSummaryQuery(): UseQueryResult<LiveSummaryItem[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', 'live-summary'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const summary = await client.request({
        path: `${API_PATH.RUNS}/live-summary`,
        schema: liveSummarySchema,
      });
      return summary.items;
    },
  });
}
