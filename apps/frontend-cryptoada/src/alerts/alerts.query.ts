// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@cryptoada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import type { Page } from '../http/api-client.js';
import { SIGNAL_ACTION } from '../overview/overview.constant.js';
import { signalSchema, type Signal } from '../overview/overview.validation.js';
import { LIVE_QUERY_ROOT } from '../live/useLiveStream.hook.js';
import {
  clearedSchema,
  priceAlertSchema,
  savedAlertSchema,
  type PriceAlert,
  type SavedAlert,
} from './alerts.validation.js';

const PAGE_SIZE = 100;
const FIRST_PAGE: string | null = null;

function pagePath(base: string, extra: Record<string, string>, cursor: string | null): string {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), ...extra });
  if (cursor !== null) query.set('cursor', cursor);
  return `${base}?${query.toString()}`;
}

// Do mais novo para o mais antigo; neutro é a decisão de quase todo candle e não é aviso, então sai da lista.
export function useSignalHistoryQuery(
  runId: string,
): UseInfiniteQueryResult<InfiniteData<Page<Signal>, string | null>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [LIVE_QUERY_ROOT.RUNS, runId, 'signals', 'history'],
    initialPageParam: FIRST_PAGE,
    queryFn: async ({ pageParam }) => {
      const page = await client.requestPage({
        path: pagePath(`${API_PATH.RUNS}/${runId}/signals`, { order: 'desc' }, pageParam),
        schema: signalSchema,
      });
      return {
        items: page.items.filter((signal) => signal.action !== SIGNAL_ACTION.HOLD),
        nextCursor: page.nextCursor,
      };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePriceAlertsQuery(): UseInfiniteQueryResult<
  InfiniteData<Page<PriceAlert>, string | null>
> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [LIVE_QUERY_ROOT.PRICE_ALERTS, 'list'],
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) =>
      client.requestPage({
        path: pagePath(API_PATH.PRICE_ALERTS, {}, pageParam),
        schema: priceAlertSchema,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useClearFiredMutation(): UseMutationResult<{ deleted: number }, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.request({
        method: HTTP_METHOD.DELETE,
        path: `${API_PATH.PRICE_ALERTS}/fired`,
        schema: clearedSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIVE_QUERY_ROOT.PRICE_ALERTS] }),
  });
}

export type PriceAlertDraft = {
  readonly symbol: string;
  readonly direction: 'above' | 'below';
  readonly value: string;
  readonly origin: 'manual' | 'plan';
};

function useInvalidatePriceAlerts(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIVE_QUERY_ROOT.PRICE_ALERTS] });
}

export function useCreatePriceAlertMutation(): UseMutationResult<
  SavedAlert,
  Error,
  PriceAlertDraft
> {
  const client = useApiClient();
  const invalidate = useInvalidatePriceAlerts();
  return useMutation({
    mutationFn: (draft: PriceAlertDraft) =>
      client.request({
        method: HTTP_METHOD.POST,
        path: API_PATH.PRICE_ALERTS,
        body: draft,
        schema: savedAlertSchema,
      }),
    onSuccess: invalidate,
  });
}

export type PriceAlertToggle = { readonly alertId: string; readonly isEnabled: boolean };

export function useTogglePriceAlertMutation(): UseMutationResult<
  SavedAlert,
  Error,
  PriceAlertToggle
> {
  const client = useApiClient();
  const invalidate = useInvalidatePriceAlerts();
  return useMutation({
    mutationFn: (toggle: PriceAlertToggle) =>
      client.request({
        method: HTTP_METHOD.PATCH,
        path: `${API_PATH.PRICE_ALERTS}/${toggle.alertId}`,
        body: { isEnabled: toggle.isEnabled },
        schema: savedAlertSchema,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePriceAlertMutation(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const invalidate = useInvalidatePriceAlerts();
  return useMutation({
    mutationFn: (alertId: string) =>
      client.requestEmpty({
        method: HTTP_METHOD.DELETE,
        path: `${API_PATH.PRICE_ALERTS}/${alertId}`,
      }),
    onSuccess: invalidate,
  });
}
