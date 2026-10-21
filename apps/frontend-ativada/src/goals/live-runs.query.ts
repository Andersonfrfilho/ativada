// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import type { ApiClient, Page } from '../http/api-client.js';
import { PAGE_SIZE, RUN_KIND_LIVE_PAPER } from '../overview/overview.constant.js';
import { RUN_QUERY_ROOT } from '../runs/runs.query.js';
import { isActiveRun, runSchema, type Run } from '../runs/run.validation.js';

// A API ainda não filtra `GET /v1/runs` por status: o painel pagina as execuções ao vivo até o fim (com teto) e fica com as ativas.
const MAX_LIVE_RUN_PAGES = 20;

async function fetchActiveLiveRuns(client: ApiClient): Promise<Run[]> {
  const active: Run[] = [];
  let cursor: string | null = null;
  for (let scanned = 0; scanned < MAX_LIVE_RUN_PAGES; scanned += 1) {
    const query = new URLSearchParams({ kind: RUN_KIND_LIVE_PAPER, limit: String(PAGE_SIZE) });
    if (cursor !== null) query.set('cursor', cursor);
    // Cada página depende do cursor da anterior.
    const page: Page<Run> = await client.requestPage({
      path: `${API_PATH.RUNS}?${query.toString()}`,
      schema: runSchema,
    });
    active.push(...page.items.filter(isActiveRun));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return active;
}

// As simulações ao vivo que ocupam uma vaga do teto: na fila ou rodando. Fica sob a raiz `runs`,
// então criar ou parar uma execução (e o aviso do stream) a refaz.
export function useActiveLiveRunsQuery(): UseQueryResult<Run[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, 'live-active'],
    queryFn: () => fetchActiveLiveRuns(client),
  });
}
