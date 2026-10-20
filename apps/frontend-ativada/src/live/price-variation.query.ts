// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { marketCandleSchema } from '../runs/candle-chart/market-candles.validation.js';
import type { VariationCandle } from './price-variation.js';

const VARIATION_TIMEFRAME = '15m';
const HISTORY_MILLISECONDS = 25 * 3_600_000;
const REFRESH_MILLISECONDS = 60_000;

// As velas de 15 min das últimas 25 h: servem 1 h, 4 h e 24 h. Uma chave por par, partilhada por todas as telas.
export function useVariationCandlesQuery(symbol: string): UseQueryResult<VariationCandle[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', symbol, 'variation-candles'],
    staleTime: REFRESH_MILLISECONDS,
    refetchInterval: REFRESH_MILLISECONDS,
    queryFn: async (): Promise<VariationCandle[]> => {
      const to = Date.now();
      const query = new URLSearchParams({
        symbol,
        timeframe: VARIATION_TIMEFRAME,
        from: String(to - HISTORY_MILLISECONDS),
        to: String(to),
      });
      const candles = await client.request({
        path: `${API_PATH.CANDLES}?${query.toString()}`,
        schema: marketCandleSchema.array(),
      });
      return candles.map((candle) => ({ closeTime: candle.closeTime, close: candle.close }));
    },
  });
}
