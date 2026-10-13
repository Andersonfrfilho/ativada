// Copyright (c) 2026 Ada Technology. All rights reserved.
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { RUN_QUERY_ROOT } from './runs.query.js';
import { tradeChartSchema, type TradeChart } from './trade-chart.validation.js';
import { tradeSummarySchema, type TradeSummary } from './trade-summary.validation.js';

export type TradeChartParams = {
  readonly runId: string;
  readonly from?: number;
  readonly to?: number;
  readonly columns?: number;
  readonly isEnabled?: boolean;
};

function chartPath(params: TradeChartParams): string {
  const query = new URLSearchParams();
  if (params.from !== undefined) query.set('from', String(params.from));
  if (params.to !== undefined) query.set('to', String(params.to));
  if (params.columns !== undefined) query.set('columns', String(params.columns));
  const text = query.toString();
  return `${API_PATH.RUNS}/${params.runId}/chart${text === '' ? '' : `?${text}`}`;
}

// Sob a raiz `runs`: o aviso do stream ao vivo invalida o gráfico junto com a execução. O gráfico anterior fica na tela enquanto a nova faixa carrega.
export function useTradeChartQuery(params: TradeChartParams): UseQueryResult<TradeChart> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, params.runId, 'chart', params.from, params.to, params.columns],
    enabled: params.isEnabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => client.request({ path: chartPath(params), schema: tradeChartSchema }),
  });
}

export function useTradeSummaryQuery(
  runId: string,
  isEnabled: boolean = true,
): UseQueryResult<TradeSummary> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'trade-summary'],
    enabled: isEnabled,
    queryFn: () =>
      client.request({
        path: `${API_PATH.RUNS}/${runId}/trade-summary`,
        schema: tradeSummarySchema,
      }),
  });
}
