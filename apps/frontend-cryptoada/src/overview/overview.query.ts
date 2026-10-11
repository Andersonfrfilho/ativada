// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import {
  LATEST_SIGNALS_COUNT,
  MILLISECONDS_PER_HOUR,
  PAGE_SIZE,
  PRICE_CHANGE_HOURS,
  PRICE_HISTORY_HOURS,
  PRICE_TIMEFRAME,
  RUN_KIND_LIVE_PAPER,
  RUN_STATUS,
  STALE_TIME_MILLISECONDS,
} from './overview.constant.js';
import {
  candleSchema,
  equityPointSchema,
  runDetailSchema,
  runSchema,
  signalSchema,
  type EquityPoint,
  type Run,
  type RunDetail,
  type Signal,
} from './overview.validation.js';
import { readSeries } from './read-series.js';

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

export function useRunDetailQuery(runId: string): UseQueryResult<RunDetail> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', runId, 'detail'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: () => client.request({ path: `${API_PATH.RUNS}/${runId}`, schema: runDetailSchema }),
  });
}

export function useEquitySeriesQuery(runId: string): UseQueryResult<EquityPoint[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', runId, 'equity'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: () =>
      readSeries({ client, path: `${API_PATH.RUNS}/${runId}/equity`, schema: equityPointSchema }),
  });
}

export function useLatestSignalsQuery(runId: string): UseQueryResult<Signal[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['runs', runId, 'signals'],
    staleTime: STALE_TIME_MILLISECONDS,
    queryFn: async () => {
      const signals = await readSeries({
        client,
        path: `${API_PATH.RUNS}/${runId}/signals`,
        schema: signalSchema,
      });
      return signals.slice(-LATEST_SIGNALS_COUNT).reverse();
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
