// Copyright (c) 2026 Ada Technology. All rights reserved.
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import { decisionSchema, type Decision } from '../live-tracking/live-status.validation.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import { HISTORICAL_WINDOW_CANDLES } from './historical-team-window.js';

const LATEST_KEY = 'latest';
const LATEST_LIMIT = 1;

// As decisões gravadas de uma execução histórica (backtest ou walk-forward), da mais recente para a mais antiga: a última
// vela, ou a janela que termina na âncora. Imutáveis depois de terminada, então ficam em cache.
export function useHistoricalDecisions(
  runId: string,
  anchor: number | undefined,
): UseQueryResult<readonly Decision[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'team-decisions', anchor ?? LATEST_KEY],
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    queryFn: async () => {
      const query = new URLSearchParams({
        limit: String(anchor === undefined ? LATEST_LIMIT : HISTORICAL_WINDOW_CANDLES),
      });
      if (anchor !== undefined) query.set('at', String(anchor));
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/decisions?${query.toString()}`,
        schema: decisionSchema,
      });
      return page.items;
    },
  });
}
