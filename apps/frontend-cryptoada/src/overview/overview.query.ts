// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import {
  LATEST_SIGNALS_COUNT,
  MILLISECONDS_PER_HOUR,
  NEWEST_PAGE_QUERY,
  PAGE_SIZE,
  PRICE_CHANGE_HOURS,
  PRICE_HISTORY_HOURS,
  PRICE_TIMEFRAME,
  RUN_KIND_LIVE_PAPER,
  RUN_STATUS,
  SIGNAL_ACTION,
  STALE_TIME_MILLISECONDS,
} from './overview.constant.js';
import {
  candleSchema,
  equityPointSchema,
  runSchema,
  signalSchema,
  type EquityPoint,
  type Run,
  type Signal,
} from './overview.validation.js';

export type CoinPrice = { readonly price: string; readonly changeRatio: number | undefined };

const ACTIVE_STATUSES: readonly string[] = [RUN_STATUS.RUNNING, RUN_STATUS.QUEUED];

export function useActiveRunQuery(): UseQueryResult<Run | null> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', 'active'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const query = new URLSearchParams({ kind: RUN_KIND_LIVE_PAPER, limit: String(PAGE_SIZE) });
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}?${query.toString()}`,
        schema: runSchema,
      });
      return (
        page.items.find((run) => run.status === RUN_STATUS.RUNNING) ??
        page.items.find((run) => ACTIVE_STATUSES.includes(run.status)) ??
        null
      );
    },
  });
}

// As últimas velas da curva, da mais antiga para a mais nova: o último ponto é o saldo de agora.
export function useEquitySeriesQuery(runId: string): UseQueryResult<EquityPoint[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', runId, 'equity', 'newest'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/equity?${NEWEST_PAGE_QUERY}`,
        schema: equityPointSchema,
      });
      return page.items.reverse();
    },
  });
}

// Neutro é a decisão de quase todo candle e não é aviso: só compra e venda, do mais novo para o mais antigo.
export function useLatestSignalsQuery(runId: string): UseQueryResult<Signal[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', runId, 'signals', 'newest'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const page = await client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/signals?${NEWEST_PAGE_QUERY}`,
        schema: signalSchema,
      });
      return page.items
        .filter((signal) => signal.action !== SIGNAL_ACTION.HOLD)
        .slice(0, LATEST_SIGNALS_COUNT);
    },
  });
}

export function useCoinPriceQuery(symbol: string): UseQueryResult<CoinPrice | null> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', symbol, 'price'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const to = Date.now();
      const query = new URLSearchParams({
        symbol,
        timeframe: PRICE_TIMEFRAME,
        from: String(to - PRICE_HISTORY_HOURS * MILLISECONDS_PER_HOUR),
        to: String(to),
      });
      const candles = await client.request({
        path: `${API_PATH.CANDLES}?${query.toString()}`,
        schema: candleSchema.array(),
      });
      const latest = candles.at(-1);
      if (latest === undefined) return null;
      const reference = candles.at(-1 - PRICE_CHANGE_HOURS);
      const changeRatio =
        reference === undefined ? undefined : Number(latest.close) / Number(reference.close) - 1;
      return { price: latest.close, changeRatio };
    },
  });
}
