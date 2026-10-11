// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { z } from '@cryptoada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import type { ApiClient, Page } from '../http/api-client.js';
import type { VersionIndex } from './version-index.js';
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

const MAX_INDEX_PAGES = 20;

async function readAllPages<TItem>(
  client: ApiClient,
  params: { readonly base: string; readonly schema: z.ZodType<TItem> },
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | null = FIRST_PAGE;
  for (let page = 0; page < MAX_INDEX_PAGES; page += 1) {
    // Páginas em sequência: o cursor da próxima só existe depois desta.
    const result = await client.requestPage({
      path: pagePath(params.base, PAGE_SIZE, cursor),
      schema: params.schema,
    });
    items.push(...result.items);
    if (result.nextCursor === null) break;
    cursor = result.nextCursor;
  }
  return items;
}

function toLabel(strategy: Strategy, version: StrategyVersion): [string, VersionLabel] {
  return [
    version.id,
    {
      strategyId: strategy.id,
      strategyName: strategy.name,
      version: version.version,
      configHash: version.configHash,
    },
  ];
}

// A execução só guarda o id da versão: este índice diz de qual estratégia e versão ela veio. Uma estratégia cujas versões
// falham não derruba o índice; ele só deixa de ser "completo".
export function useVersionIndexQuery(): UseQueryResult<VersionIndex> {
  const client = useApiClient();
  return useQuery({
    queryKey: [STRATEGY_QUERY_ROOT, 'version-index'],
    staleTime: STALE_MILLISECONDS,
    queryFn: async () => {
      const strategies = await readAllPages(client, {
        base: API_PATH.STRATEGIES,
        schema: strategySchema,
      });
      const settled = await Promise.allSettled(
        strategies.map(async (strategy) => ({
          strategy,
          versions: await readAllPages(client, {
            base: `${API_PATH.STRATEGIES}/${strategy.id}/versions`,
            schema: versionSchema,
          }),
        })),
      );
      const labels = new Map<string, VersionLabel>();
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        for (const version of result.value.versions) {
          labels.set(...toLabel(result.value.strategy, version));
        }
      }
      return { labels, isComplete: settled.every((result) => result.status === 'fulfilled') };
    },
  });
}
