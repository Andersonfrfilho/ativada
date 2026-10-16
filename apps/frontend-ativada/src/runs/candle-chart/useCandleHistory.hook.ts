// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from 'react';

import { useApiClient } from '../../app/useAppContext.hook.js';
import type { ApiClient } from '../../http/api-client.js';
import {
  INITIAL_HISTORY_STATE,
  reduceHistory,
  type HistoryAction,
  type HistoryPaging,
  type HistoryState,
} from './candle-history.reducer.js';
import { isRateLimitError } from '../../http/rate-limit.js';
import { fetchMarketCandlesPage } from './candle-chart.query.js';
import { previousPageRange, type PageRange } from './candle-paging.js';
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

export type CandleHistory = HistoryState & {
  readonly loadPrevious: () => void;
  // Pede de novo a primeira página depois de uma falha.
  readonly retry: () => void;
};

type LoadedSeries = { readonly key: string; readonly to: number };
type LoadedRef = { current: LoadedSeries | undefined };
type LoaderControl = {
  readonly dispatch: Dispatch<HistoryAction>;
  readonly loaded: LoadedRef;
  // Sobe a cada "tentar de novo": a mesma série que falhou pede outra vez.
  readonly attempt: number;
};

type PageRequest = {
  readonly queryClient: QueryClient;
  readonly client: ApiClient;
  readonly symbol: string;
  readonly timeframe: string;
  readonly page: PageRange;
  readonly earliestTime: number;
};

type ActionBuilder = (candles: MarketCandle[], paging: HistoryPaging) => HistoryAction;

// Uma falha vira ação, nunca exceção: a tela decide o que mostrar (a reserva, ou as velas que já tem).
async function requestPage(request: PageRequest, toAction: ActionBuilder): Promise<HistoryAction> {
  const { queryClient, client, symbol, timeframe, page, earliestTime } = request;
  try {
    const { candles, retentionStart } = await fetchMarketCandlesPage(queryClient, client, {
      symbol,
      timeframe,
      ...page,
    });
    // Velas de exibição não existem antes do corte da retenção: a página para ali, sem pedir o que não há.
    const floor = Math.max(earliestTime, retentionStart ?? earliestTime);
    return toAction(candles, {
      hasMore: page.from > floor,
      reachedFrom: page.from,
      retentionStart,
    });
  } catch (error) {
    const rateLimit = isRateLimitError(error)
      ? { retryAfterSeconds: error.retryAfterSeconds, now: Date.now() }
      : undefined;
    return { type: 'failed', scope: 'page', rateLimit };
  }
}

function seriesKeyOf(params: CandleHistoryParams): string {
  return `${params.symbol}|${params.timeframe}|${params.window.anchor}`;
}

type SeriesLoad = {
  readonly request: PageRequest;
  readonly isTail: boolean;
  readonly seriesKey: string;
};

async function loadSeriesPage(
  { request, isTail, seriesKey }: SeriesLoad,
  control: Pick<LoaderControl, 'dispatch' | 'loaded'>,
  isActive: () => boolean,
): Promise<void> {
  const { timeframe, page } = request;
  const action = await requestPage(request, (candles, paging) =>
    isTail ? { type: 'append', candles } : { type: 'replace', candles, timeframe, paging },
  );
  if (!isActive()) return;
  if (action.type !== 'failed') control.loaded.current = { key: seriesKey, to: page.to };
  control.dispatch(action.type === 'failed' && !isTail ? { ...action, scope: 'series' } : action);
}

// A série (par, vela e janela) pede a primeira página; a mesma série com o fim mais adiante pede só a ponta nova. A primeira
// página de uma série sai UMA vez por tentativa: o fim da janela anda com o relógio e, sem isto, cada passo dele cancelaria o
// pedido em andamento (ou, depois de um 429, repetiria o pedido sem parar e alimentaria o próprio limite).
function useSeriesLoader(params: CandleHistoryParams, control: LoaderControl): void {
  const { dispatch, loaded, attempt } = control;
  const { symbol, timeframe, window, earliestTime } = params;
  const client = useApiClient();
  const queryClient = useQueryClient();
  const seriesKey = seriesKeyOf(params);
  const { from, to } = window.range;
  const latestToken = useRef('');
  const requestedToken = useRef('');
  useEffect(() => {
    const token = `${seriesKey}|${attempt}`;
    latestToken.current = token;
    const previous = loaded.current;
    const isSameSeries = previous?.key === seriesKey;
    const isTail = isSameSeries && previous !== undefined && to > previous.to;
    if (isSameSeries && !isTail) return;
    if (!isTail && requestedToken.current === token) return;
    const page = isTail && previous !== undefined ? { from: previous.to, to } : { from, to };
    if (page.to <= page.from) return;
    if (!isTail) requestedToken.current = token;
    const request = { queryClient, client, symbol, timeframe, page, earliestTime };
    const isActive = (): boolean => latestToken.current === token;
    void loadSeriesPage({ request, isTail, seriesKey }, { dispatch, loaded }, isActive);
  }, [
    client,
    queryClient,
    symbol,
    timeframe,
    seriesKey,
    from,
    to,
    earliestTime,
    dispatch,
    loaded,
    attempt,
  ]);
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
  const [attempt, setAttempt] = useState(0);
  const seriesKey = seriesKeyOf(params);
  useSeriesLoader(params, { dispatch, loaded, attempt });
  const retryAt = state.rateLimit?.retryAt;

  const retry = useCallback((): void => {
    loaded.current = undefined;
    dispatch({ type: 'retry' });
    setAttempt((count) => count + 1);
  }, []);

  // O 429 não vira tela vazia: repete sozinho na hora combinada (o botão antecipa).
  useEffect(() => {
    if (retryAt === undefined || state.status !== 'error') return undefined;
    const timer = setTimeout(retry, Math.max(0, retryAt - Date.now()));
    return (): void => clearTimeout(timer);
  }, [retry, retryAt, state.status]);

  async function loadOlder(page: PageRange): Promise<void> {
    const request = { queryClient, client, symbol, timeframe, page, earliestTime };
    const toPrepend: ActionBuilder = (candles, paging) => ({ type: 'prepend', candles, paging });
    const action = await requestPage(request, toPrepend);
    if (loaded.current?.key === seriesKey) dispatch(action);
  }

  function loadPrevious(): void {
    const first = state.candles[0];
    if (first === undefined || !state.hasMore || state.isLoadingPrevious) return;
    const firstOpenTime = Math.min(first.openTime, state.reachedFrom ?? first.openTime);
    const page = previousPageRange({ firstOpenTime, timeframeMilliseconds, earliestTime });
    if (page === undefined) return;
    dispatch({ type: 'loadingPrevious' });
    void loadOlder(page);
  }

  return { ...state, loadPrevious, retry };
}
