// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@ativada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient, useAppConfig } from '../app/useAppContext.hook.js';
import type { Page } from '../http/api-client.js';
import { downsample, parseEquityCsv, type CurvePoint } from './equity-csv.js';
import {
  CURVE_MAX_POINTS,
  LIST_PAGE_SIZE,
  RUN_POLL_MILLISECONDS,
  type RunKind,
} from './run.constant.js';
import {
  isActiveRun,
  runDetailSchema,
  runSchema,
  tradeSchema,
  windowSchema,
  type Run,
  type RunDetail,
  type Trade,
  type WalkForwardWindow,
} from './run.validation.js';

export const RUN_QUERY_ROOT = 'runs';
const FIRST_PAGE: string | null = null;
const TRADES_PAGE_SIZE = 100;
const WINDOWS_PAGE_SIZE = 100;

function pagePath(base: string, extra: Record<string, string>, cursor: string | null): string {
  const query = new URLSearchParams(extra);
  if (cursor !== null) query.set('cursor', cursor);
  return `${base}?${query.toString()}`;
}

function listFilters(kind: RunKind, symbol: string | undefined): Record<string, string> {
  const filters: Record<string, string> = { kind, limit: String(LIST_PAGE_SIZE) };
  if (symbol !== undefined) filters['symbol'] = symbol;
  return filters;
}

// Enquanto está na fila ou rodando, consulta de novo sozinho (o painel não depende de recarregar a página).
export function useRunDetailQuery(runId: string): UseQueryResult<RunDetail> {
  const client = useApiClient();
  const { runPollMilliseconds = RUN_POLL_MILLISECONDS } = useAppConfig();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'detail'],
    queryFn: () => client.request({ path: `${API_PATH.RUNS}/${runId}`, schema: runDetailSchema }),
    refetchInterval: (query) =>
      query.state.data !== undefined && isActiveRun(query.state.data) ? runPollMilliseconds : false,
  });
}

// `isEnabled` falso adia a consulta (a troca rápida só pede os outros tipos com a lista aberta); a chave é a da tela de Backtests.
export function useRunListQuery(
  kind: RunKind,
  symbol?: string,
  isEnabled = true,
): UseInfiniteQueryResult<InfiniteData<Page<Run>, string | null>> {
  const client = useApiClient();
  const { runPollMilliseconds = RUN_POLL_MILLISECONDS } = useAppConfig();
  return useInfiniteQuery({
    queryKey: [RUN_QUERY_ROOT, 'list', kind, symbol ?? null],
    enabled: isEnabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      client.requestPage({
        path: pagePath(API_PATH.RUNS, listFilters(kind, symbol), pageParam),
        schema: runSchema,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Uma execução na fila ou rodando muda de estado sozinha: a lista acompanha enquanto houver uma.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some(isActiveRun)) === true
        ? runPollMilliseconds
        : false,
  });
}

// A curva inteira vem do CSV do registro (uma chamada), não de centenas de páginas de 100 pontos.
export function useEquityCurveQuery(
  runId: string,
  isEnabled: boolean,
): UseQueryResult<CurvePoint[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'curve'],
    enabled: isEnabled,
    staleTime: Infinity,
    queryFn: async () => {
      const file = await client.download(`${API_PATH.RUNS}/${runId}/export.csv?table=equity`);
      return downsample(parseEquityCsv(await file.blob.text()), CURVE_MAX_POINTS);
    },
  });
}

export type TradesFilters = {
  readonly from?: number;
  readonly to?: number;
  readonly status?: 'open' | 'closed';
  readonly order?: 'asc' | 'desc';
};

function tradesFilterParams(filters: TradesFilters): Record<string, string> {
  return {
    ...(filters.from === undefined ? {} : { from: String(filters.from) }),
    ...(filters.to === undefined ? {} : { to: String(filters.to) }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.order === undefined ? {} : { order: filters.order }),
  };
}

export function useTradesQuery(
  runId: string,
  filters: TradesFilters = {},
): UseInfiniteQueryResult<InfiniteData<Page<Trade>, string | null>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [
      RUN_QUERY_ROOT,
      runId,
      'trades',
      filters.from,
      filters.to,
      filters.status,
      filters.order,
    ],
    initialPageParam: FIRST_PAGE,
    // A tabela segue a faixa do gráfico: a lista anterior fica na tela enquanto a nova faixa carrega.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      client.requestPage({
        path: pagePath(
          `${API_PATH.RUNS}/${runId}/trades`,
          { limit: String(TRADES_PAGE_SIZE), ...tradesFilterParams(filters) },
          pageParam,
        ),
        schema: tradeSchema,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useWindowsQuery(
  runId: string,
  isEnabled: boolean,
): UseQueryResult<WalkForwardWindow[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'windows'],
    enabled: isEnabled,
    queryFn: async () =>
      (
        await client.requestPage({
          path: pagePath(
            `${API_PATH.RUNS}/${runId}/windows`,
            { limit: String(WINDOWS_PAGE_SIZE) },
            FIRST_PAGE,
          ),
          schema: windowSchema,
        })
      ).items,
  });
}

export function useCreateRunMutation(): UseMutationResult<
  RunDetail,
  Error,
  Record<string, unknown>
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.request({
        method: HTTP_METHOD.POST,
        path: API_PATH.RUNS,
        body,
        schema: runDetailSchema,
      }),
    // Criar uma execução muda também a ativa e a ligada a meta da visão geral: tudo sob a raiz `runs` é refeito.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RUN_QUERY_ROOT] }),
  });
}

export function useStopRunMutation(runId: string): UseMutationResult<void, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.requestEmpty({ method: HTTP_METHOD.POST, path: `${API_PATH.RUNS}/${runId}/stop` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RUN_QUERY_ROOT] }),
  });
}
