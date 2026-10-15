// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import type { Page } from '../../http/api-client.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import {
  decisionSchema,
  liveStatusSchema,
  type Decision,
  type LiveStatus,
} from './live-status.validation.js';

export const DECISIONS_PAGE_SIZE = 24;
// As 24 mais novas já vêm no live-status: o primeiro pedido das anteriores traz as 24 seguintes junto (e refaz sem buraco a cada vela).
export const DECISIONS_FIRST_PAGE_SIZE = DECISIONS_PAGE_SIZE * 2;
const FIRST_PAGE: string | null = null;

// Sob a raiz `runs`: o aviso do stream ao vivo invalida o acompanhamento junto com a execução, sem cache próprio.
export function useLiveStatusQuery(runId: string, isEnabled: boolean): UseQueryResult<LiveStatus> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'live-status'],
    enabled: isEnabled,
    queryFn: () =>
      client.request({ path: `${API_PATH.RUNS}/${runId}/live-status`, schema: liveStatusSchema }),
  });
}

// "Ver decisões anteriores": a primeira página já vem no `live-status`; esta lista traz as seguintes, da mais nova à mais velha.
export function useDecisionsQuery(
  runId: string,
  isEnabled: boolean,
): UseInfiniteQueryResult<InfiniteData<Page<Decision>, string | null>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'decisions'],
    enabled: isEnabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) => {
      const limit = pageParam === null ? DECISIONS_FIRST_PAGE_SIZE : DECISIONS_PAGE_SIZE;
      const query = new URLSearchParams({ limit: String(limit) });
      if (pageParam !== null) query.set('cursor', pageParam);
      return client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/decisions?${query.toString()}`,
        schema: decisionSchema,
      });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
