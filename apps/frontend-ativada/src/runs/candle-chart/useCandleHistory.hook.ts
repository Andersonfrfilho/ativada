// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, type Dispatch } from 'react';

import { useApiClient } from '../../app/useAppContext.hook.js';
import type { ApiClient } from '../../http/api-client.js';
import {
  INITIAL_HISTORY_STATE,
  reduceHistory,
  type HistoryAction,
  type HistoryState,
} from './candle-history.reducer.js';
import { fetchMarketCandlesPage } from './candle-chart.query.js';
import { hasMoreHistory, previousPageRange, type PageRange } from './candle-paging.js';
import type { CandleWindow } from './candle-window.js';
import type { MarketCandle } from './market-candles.validation.js';

export type CandleHistoryParams = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly window: CandleWindow;
  // Nada antes disto interessa (o começo do período da execução).
  readonly earliestTime: number;
  readonly timeframeMilliseconds: number;
};

export type CandleHistory = HistoryState & { readonly loadPrevious: () => void };

type LoadedSeries = { readonly key: string; readonly to: number };
type LoadedRef = { current: LoadedSeries | undefined };

type PageRequest = {
  readonly queryClient: QueryClient;
  readonly client: ApiClient;
  readonly symbol: string;
  readonly timeframe: string;
  readonly page: PageRange;
  readonly earliestTime: number;
};

type ActionBuilder = (candles: MarketCandle[], hasMore: boolean) => HistoryAction;

// Uma falha vira ação, nunca exceção: a tela decide o que mostrar (a reserva, ou as velas que já tem).
async function requestPage(request: PageRequest, toAction: ActionBuilder): Promise<HistoryAction> {
  const { queryClient, client, symbol, timeframe, page, earliestTime } = request;
  try {
    const candles = await fetchMarketCandlesPage(queryClient, client, {
      symbol,
      timeframe,
      ...page,
    });
    return toAction(candles, hasMoreHistory(candles.length) && page.from > earliestTime);
  } catch {
    return { type: 'failed' };
  }
}

function seriesKeyOf(params: CandleHistoryParams): string {
  return `${params.symbol}|${params.timeframe}|${params.window.anchor}`;
}

// A série (par, vela e janela) pede a primeira página; a mesma série com o fim mais adiante pede só a ponta nova.
function useSeriesLoader(
  params: CandleHistoryParams,
  dispatch: Dispatch<HistoryAction>,
  loaded: LoadedRef,
): void {
  const { symbol, timeframe, window, earliestTime } = params;
  const client = useApiClient();
  const queryClient = useQueryClient();
  const seriesKey = seriesKeyOf(params);
  const { from, to } = window.range;
  useEffect(() => {
    const previous = loaded.current;
    const isSameSeries = previous?.key === seriesKey;
    const isTail = isSameSeries && previous !== undefined && to > previous.to;
    if (isSameSeries && !isTail) return undefined;
    const page = isTail && previous !== undefined ? { from: previous.to, to } : { from, to };
    if (page.to <= page.from) return undefined;
    let isActive = true;
    async function load(): Promise<void> {
      const request = { queryClient, client, symbol, timeframe, page, earliestTime };
      const action = await requestPage(request, (candles, hasMore) =>
        isTail ? { type: 'append', candles } : { type: 'replace', candles, timeframe, hasMore },
      );
      if (!isActive) return;
      if (action.type !== 'failed') loaded.current = { key: seriesKey, to };
      dispatch(action);
    }
    void load();
    return (): void => {
      isActive = false;
    };
  }, [client, queryClient, symbol, timeframe, seriesKey, from, to, earliestTime, dispatch, loaded]);
}

// As velas do gráfico: a primeira página, a vela nova que fecha no fim (só a ponta, sem reenquadrar) e as páginas
// anteriores sob demanda. Troca de par, vela ou janela escolhida troca a série, mas mantém as velas antigas na tela até as
// novas chegarem (nada de piscar); se a primeira página falha, `status` vira `error` e o gráfico simples assume.
export function useCandleHistory(params: CandleHistoryParams): CandleHistory {
  const { symbol, timeframe, earliestTime, timeframeMilliseconds } = params;
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reduceHistory, INITIAL_HISTORY_STATE);
  const loaded = useRef<LoadedSeries | undefined>(undefined);
  const seriesKey = seriesKeyOf(params);
  useSeriesLoader(params, dispatch, loaded);

  async function loadOlder(page: PageRange): Promise<void> {
    const request = { queryClient, client, symbol, timeframe, page, earliestTime };
    const toPrepend: ActionBuilder = (candles, hasMore) => ({ type: 'prepend', candles, hasMore });
    const action = await requestPage(request, toPrepend);
    if (loaded.current?.key === seriesKey) dispatch(action);
  }

  function loadPrevious(): void {
    const first = state.candles[0];
    if (first === undefined || !state.hasMore || state.isLoadingPrevious) return;
    const firstOpenTime = first.openTime;
    const page = previousPageRange({ firstOpenTime, timeframeMilliseconds, earliestTime });
    if (page === undefined) return;
    dispatch({ type: 'loadingPrevious' });
    void loadOlder(page);
  }

  return { ...state, loadPrevious };
}
