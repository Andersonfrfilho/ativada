// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useApiClient } from '../app/useAppContext.hook.js';
import type { Page } from '../http/api-client.js';
import {
  NOTICE_LIST_LIMIT,
  NOTICE_QUERY_KEY,
  NOTICE_SCOPE,
  NOTICES_PATH,
  PRICE_ALERT_LIST_LIMIT,
} from './notice.constant.js';
import { noticeSchema, type Notice } from './notice.validation.js';

// A raiz das chaves é a do assunto: `runs` (todo `event` do stream a refaz) e `price-alerts` (todo `price_alert`).
const FIRST_PAGE: string | null = null;

export const RUN_NOTICES_KEY = ['runs', NOTICE_QUERY_KEY] as const;
export const PRICE_NOTICES_KEY = ['price-alerts', NOTICE_QUERY_KEY] as const;

function buildPath(params: {
  readonly scope: string;
  readonly limit: number;
  readonly cursor: string | null;
}): string {
  const query = new URLSearchParams({ scope: params.scope, limit: String(params.limit) });
  if (params.cursor !== null) query.set('cursor', params.cursor);
  return `${NOTICES_PATH}?${query.toString()}`;
}

// Os avisos das simulações (ciclo da ordem, saídas, paradas, meta): "Ver avisos anteriores" pagina pelo cursor.
export function useRunNoticesQuery(): UseInfiniteQueryResult<
  InfiniteData<Page<Notice>, string | null>
> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: RUN_NOTICES_KEY,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      client.requestPage({
        path: buildPath({ scope: NOTICE_SCOPE.RUNS, limit: NOTICE_LIST_LIMIT, cursor: pageParam }),
        schema: noticeSchema,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });
}

// O mesmo endpoint, só os alertas de preço disparados: só o `price_alert` do stream o refaz.
export function usePriceNoticesQuery(): UseQueryResult<Page<Notice>> {
  const client = useApiClient();
  return useQuery({
    queryKey: PRICE_NOTICES_KEY,
    queryFn: () =>
      client.requestPage({
        path: buildPath({
          scope: NOTICE_SCOPE.PRICE_ALERTS,
          limit: PRICE_ALERT_LIST_LIMIT,
          cursor: null,
        }),
        schema: noticeSchema,
      }),
  });
}
