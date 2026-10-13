// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { PAGE_SIZE, RUN_KIND_LIVE_PAPER } from '../overview/overview.constant.js';
import { RUN_QUERY_ROOT } from '../runs/runs.query.js';
import { isActiveRun, runSchema, type Run } from '../runs/run.validation.js';

// As simulações ao vivo que ocupam uma vaga do teto: na fila ou rodando. Fica sob a raiz `runs`,
// então criar ou parar uma execução (e o aviso do stream) a refaz.
export function useActiveLiveRunsQuery(): UseQueryResult<Run[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, 'live-active'],
    queryFn: async () => {
      const query = new URLSearchParams({ kind: RUN_KIND_LIVE_PAPER, limit: String(PAGE_SIZE) });
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}?${query.toString()}`,
        schema: runSchema,
      });
      return page.items.filter(isActiveRun);
    },
  });
}
