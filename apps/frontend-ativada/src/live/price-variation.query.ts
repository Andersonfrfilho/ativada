// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { marketCandleSchema } from '../runs/candle-chart/market-candles.validation.js';
import type { VariationCandle } from './price-variation.js';

const QUARTER_HOUR_TIMEFRAME = '15m';
const QUARTER_HOUR_HISTORY_MILLISECONDS = 25 * 3_600_000;
const MINUTE_TIMEFRAME = '1m';
// 25 velas de 1 min cobrem 1, 5 e 15 min com folga.
const MINUTE_HISTORY_MILLISECONDS = 25 * 60_000;
const REFRESH_MILLISECONDS = 60_000;

type VariationCandlesParams = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly historyMilliseconds: number;
};

type ApiClient = ReturnType<typeof useApiClient>;

async function fetchVariationCandles(
  client: ApiClient,
  params: VariationCandlesParams,
): Promise<VariationCandle[]> {
  const to = Date.now();
  const query = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(to - params.historyMilliseconds),
    to: String(to),
  });
  const candles = await client.request({
    path: `${API_PATH.CANDLES}?${query.toString()}`,
    schema: marketCandleSchema.array(),
  });
  return candles.map((candle) => ({ closeTime: candle.closeTime, close: candle.close }));
}

// As velas de 15 min das últimas 25 h: servem 1 h, 4 h e 24 h. Uma chave por par, partilhada por todas as telas.
export function useVariationCandlesQuery(symbol: string): UseQueryResult<VariationCandle[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', symbol, 'variation-candles'],
    staleTime: REFRESH_MILLISECONDS,
    refetchInterval: REFRESH_MILLISECONDS,
    queryFn: () =>
      fetchVariationCandles(client, {
        symbol,
        timeframe: QUARTER_HOUR_TIMEFRAME,
        historyMilliseconds: QUARTER_HOUR_HISTORY_MILLISECONDS,
      }),
  });
}

// As velas de 1 min das últimas ~25 min, só quando o ambiente as grava (`isEnabled`): reserva de 1, 5 e 15 min.
export function useVariationMinuteCandlesQuery(
  symbol: string,
  isEnabled: boolean,
): UseQueryResult<VariationCandle[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', symbol, 'variation-minute-candles'],
    enabled: isEnabled,
    staleTime: REFRESH_MILLISECONDS,
    refetchInterval: REFRESH_MILLISECONDS,
    queryFn: () =>
      fetchVariationCandles(client, {
        symbol,
        timeframe: MINUTE_TIMEFRAME,
        historyMilliseconds: MINUTE_HISTORY_MILLISECONDS,
      }),
  });
}
