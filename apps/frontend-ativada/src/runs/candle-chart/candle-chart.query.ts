// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  keepPreviousData,
  useQuery,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { z } from '@ativada/environment';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import type { ApiClient } from '../../http/api-client.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import { marketCandleSchema, type MarketCandle } from './market-candles.validation.js';
import {
  projectionsPageSchema,
  projectionsSchema,
  type Projections,
  type ProjectionsPage,
} from './projections.validation.js';
import { strategyLayersSchema, type StrategyLayers } from './strategy-layers.validation.js';

// Velas são públicas: ficam sob a raiz `markets`, fora do aviso `runs` (a vela fechada chega pelo stream).
export const MARKET_QUERY_ROOT = 'markets';

export type StrategyLayersParams = {
  readonly runId: string;
  readonly from?: number;
  readonly to?: number;
  readonly isEnabled?: boolean;
};

export type ProjectionsParams = {
  readonly runId: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly isEnabled?: boolean;
};

export type MarketCandlesParams = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly from: number;
  readonly to: number;
  readonly isEnabled?: boolean;
};

function withQuery(path: string, entries: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(entries)) {
    if (value !== undefined) query.set(name, value);
  }
  const text = query.toString();
  return text === '' ? path : `${path}?${text}`;
}

function textOf(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

// Sob a raiz `runs`: o aviso do stream refaz as camadas junto com a execução. A faixa anterior fica na tela até a nova chegar.
export function useStrategyLayersQuery(
  params: StrategyLayersParams,
): UseQueryResult<StrategyLayers> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, params.runId, 'strategy-layers', params.from, params.to],
    enabled: params.isEnabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () =>
      client.request({
        path: withQuery(`${API_PATH.RUNS}/${params.runId}/strategy-layers`, {
          from: textOf(params.from),
          to: textOf(params.to),
        }),
        schema: strategyLayersSchema,
      }),
  });
}

function projectionsPath(params: ProjectionsParams): string {
  return withQuery(`${API_PATH.RUNS}/${params.runId}/projections`, {
    cursor: params.cursor,
    limit: textOf(params.limit),
  });
}

// A primeira página: a mais nova, com a tendência atual e o resumo.
export function useProjectionsQuery(params: ProjectionsParams): UseQueryResult<Projections> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, params.runId, 'projections', params.cursor, params.limit],
    enabled: params.isEnabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => client.request({ path: projectionsPath(params), schema: projectionsSchema }),
  });
}

// As páginas por cursor (o "Ver mais" da tabela): só as previsões, sem tendência nem resumo.
export function useProjectionsPageQuery(
  params: ProjectionsParams,
): UseQueryResult<ProjectionsPage> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, params.runId, 'projections', params.cursor, params.limit],
    enabled: params.isEnabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => client.request({ path: projectionsPath(params), schema: projectionsPageSchema }),
  });
}

function marketCandlesKey(params: MarketCandlesParams): readonly unknown[] {
  return [MARKET_QUERY_ROOT, params.symbol, params.timeframe, 'candles', params.from, params.to];
}

// `retentionStart` só vem nas velas de exibição: a abertura da primeira vela que a retenção ainda guarda (spec 017).
const retentionMetaSchema = z.object({ retentionStart: z.number() });

export type MarketCandlesPage = {
  readonly candles: MarketCandle[];
  readonly retentionStart: number | undefined;
};

async function requestMarketCandles(
  client: ApiClient,
  params: MarketCandlesParams,
): Promise<MarketCandlesPage> {
  const { data, meta } = await client.requestWithMeta({
    path: withQuery(API_PATH.CANDLES, {
      symbol: params.symbol,
      timeframe: params.timeframe,
      from: String(params.from),
      to: String(params.to),
    }),
    schema: marketCandleSchema.array(),
    metaSchema: retentionMetaSchema,
  });
  return { candles: data, retentionStart: meta?.retentionStart };
}

export function useMarketCandlesQuery(params: MarketCandlesParams): UseQueryResult<MarketCandle[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: marketCandlesKey(params),
    enabled: params.isEnabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => requestMarketCandles(client, params),
    select: (page) => page.candles,
  });
}

// Uma página de velas FECHADAS é imutável para o par de limites que a pediu: pode ficar no cache para sempre. Uma página
// vazia não: ela pode ser só um atraso do provedor, então sai do cache e o próximo pedido vai à rede.
export async function fetchMarketCandlesPage(
  queryClient: QueryClient,
  client: ApiClient,
  params: MarketCandlesParams,
): Promise<MarketCandlesPage> {
  const page = await queryClient.fetchQuery({
    queryKey: marketCandlesKey(params),
    staleTime: Infinity,
    // Quem repete é o histórico (com aviso e contagem); a repetição escondida do cliente deixaria o gráfico em "Carregando".
    retry: false,
    queryFn: () => requestMarketCandles(client, params),
  });
  if (page.candles.length === 0) queryClient.removeQueries({ queryKey: marketCandlesKey(params) });
  return page;
}
