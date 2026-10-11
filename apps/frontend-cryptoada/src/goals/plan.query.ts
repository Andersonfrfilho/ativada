// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { candleSchema, type Candle } from '../overview/overview.validation.js';
import {
  GOAL_QUERY_ROOT,
  GOAL_TIMEFRAME,
  MILLISECONDS_PER_DAY,
  PLAN_HISTORY_DAYS,
} from './goal.constant.js';
import { planViewSchema, type PlanView } from './plan.validation.js';

export function useGoalPlanQuery(goalId: string, strategyId: string): UseQueryResult<PlanView> {
  const client = useApiClient();
  return useQuery({
    queryKey: [GOAL_QUERY_ROOT, goalId, 'plan', strategyId],
    enabled: strategyId !== '',
    queryFn: () =>
      client.request({
        path: `${API_PATH.GOALS}/${goalId}/plan?${new URLSearchParams({ strategyId }).toString()}`,
        schema: planViewSchema,
      }),
  });
}

// Os últimos dias fechados do par, só para o traço de preço do gráfico.
export function usePlanCandlesQuery(symbol: string | undefined): UseQueryResult<Candle[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', symbol, 'plan-candles'],
    enabled: symbol !== undefined,
    queryFn: () => {
      const to = Date.now();
      const query = new URLSearchParams({
        symbol: symbol ?? '',
        timeframe: GOAL_TIMEFRAME,
        from: String(to - PLAN_HISTORY_DAYS * MILLISECONDS_PER_DAY),
        to: String(to),
      });
      return client.request({
        path: `${API_PATH.CANDLES}?${query.toString()}`,
        schema: candleSchema.array(),
      });
    },
  });
}
