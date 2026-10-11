// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import type { Page } from '../http/api-client.js';
import {
  strategyDetailSchema,
  strategySchema,
  versionSchema,
  type Strategy,
  type StrategyDetail,
  type StrategyVersion,
  type VersionLabel,
} from './strategy.validation.js';

const PAGE_SIZE = 100;
const LIST_PAGE_SIZE = 20;
const STALE_MILLISECONDS = 15_000;
const FIRST_PAGE: string | null = null;

export const STRATEGY_QUERY_ROOT = 'strategies';

function pagePath(base: string, size: number, cursor: string | null): string {
  const query = new URLSearchParams({ limit: String(size) });
  if (cursor !== null) query.set('cursor', cursor);
  return `${base}?${query.toString()}`;
}

// Para os seletores: as estratégias do usuário numa página só (teto da API).
export function useStrategiesQuery(): UseQueryResult<Strategy[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [STRATEGY_QUERY_ROOT, 'all'],
    staleTime: STALE_MILLISECONDS,
    queryFn: async () =>
      (
        await client.requestPage({
          path: pagePath(API_PATH.STRATEGIES, PAGE_SIZE, null),
          schema: strategySchema,
        })
      ).items,
  });
}

export function useStrategiesInfiniteQuery(): UseInfiniteQueryResult<
  InfiniteData<Page<Strategy>, string | null>
> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [STRATEGY_QUERY_ROOT, 'list'],
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      client.requestPage({
        path: pagePath(API_PATH.STRATEGIES, LIST_PAGE_SIZE, pageParam),
        schema: strategySchema,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useStrategyQuery(strategyId: string): UseQueryResult<StrategyDetail> {
  const client = useApiClient();
  return useQuery({
    queryKey: [STRATEGY_QUERY_ROOT, strategyId],
    queryFn: () =>
      client.request({
        path: `${API_PATH.STRATEGIES}/${strategyId}`,
        schema: strategyDetailSchema,
      }),
  });
}

// Da mais nova para a mais antiga (a ordem da API).
export function useVersionsQuery(strategyId: string): UseQueryResult<StrategyVersion[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [STRATEGY_QUERY_ROOT, strategyId, 'versions'],
    staleTime: STALE_MILLISECONDS,
    queryFn: async () =>
      (
        await client.requestPage({
          path: pagePath(`${API_PATH.STRATEGIES}/${strategyId}/versions`, PAGE_SIZE, null),
          schema: versionSchema,
        })
      ).items,
  });
}

// A execução só guarda o id da versão: este índice diz de qual estratégia e versão ela veio.
export function useVersionIndexQuery(): UseQueryResult<ReadonlyMap<string, VersionLabel>> {
  const client = useApiClient();
  return useQuery({
    queryKey: [STRATEGY_QUERY_ROOT, 'version-index'],
    staleTime: STALE_MILLISECONDS,
    queryFn: async () => {
      const strategies = (
        await client.requestPage({
          path: pagePath(API_PATH.STRATEGIES, PAGE_SIZE, null),
          schema: strategySchema,
        })
      ).items;
      const pages = await Promise.all(
        strategies.map(async (strategy) => ({
          strategy,
          versions: (
            await client.requestPage({
              path: pagePath(`${API_PATH.STRATEGIES}/${strategy.id}/versions`, PAGE_SIZE, null),
              schema: versionSchema,
            })
          ).items,
        })),
      );
      return new Map(
        pages.flatMap(({ strategy, versions }) =>
          versions.map((version): [string, VersionLabel] => [
            version.id,
            {
              strategyId: strategy.id,
              strategyName: strategy.name,
              version: version.version,
              configHash: version.configHash,
            },
          ]),
        ),
      );
    },
  });
}
