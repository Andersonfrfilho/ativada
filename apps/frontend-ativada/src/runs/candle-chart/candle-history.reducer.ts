// Copyright (c) 2026 Ada Technology. All rights reserved.
import { capCandles, mergeCandlePages } from './candle-paging.js';
import type { MarketCandle } from './market-candles.validation.js';

export type HistoryState = {
  readonly candles: readonly MarketCandle[];
  // A vela das velas acima (muda um instante depois do pedido da troca).
  readonly timeframe: string | undefined;
  readonly status: 'loading' | 'ready' | 'error';
  // Sobe a cada troca de série: a tela reenquadra o gráfico; página nova à esquerda ou vela nova no fim não reenquadram.
  readonly generation: number;
  readonly hasMore: boolean;
  // Até onde já pedimos para a esquerda: uma página vazia ainda avança, então o pedido seguinte não se repete.
  readonly reachedFrom: number | undefined;
  readonly isLoadingPrevious: boolean;
};

export type HistoryPaging = { readonly hasMore: boolean; readonly reachedFrom: number };

export type HistoryAction =
  | {
      readonly type: 'replace';
      readonly candles: readonly MarketCandle[];
      readonly timeframe: string;
      readonly paging: HistoryPaging;
    }
  | { readonly type: 'append'; readonly candles: readonly MarketCandle[] }
  | {
      readonly type: 'prepend';
      readonly candles: readonly MarketCandle[];
      readonly paging: HistoryPaging;
    }
  | { readonly type: 'loadingPrevious' }
  | { readonly type: 'retry' }
  // `series`: a primeira página da série não veio (o gráfico simples assume); `page`: outra página falhou e as velas ficam.
  | { readonly type: 'failed'; readonly scope: 'series' | 'page' };

export const INITIAL_HISTORY_STATE: HistoryState = {
  candles: [],
  timeframe: undefined,
  status: 'loading',
  generation: 0,
  hasMore: false,
  reachedFrom: undefined,
  isLoadingPrevious: false,
};

export function reduceHistory(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'replace') {
    return {
      candles: action.candles,
      timeframe: action.timeframe,
      status: 'ready',
      generation: state.generation + 1,
      hasMore: action.paging.hasMore,
      reachedFrom: action.paging.reachedFrom,
      isLoadingPrevious: false,
    };
  }
  if (action.type === 'append') {
    return { ...state, candles: mergeCandlePages(state.candles, action.candles) };
  }
  if (action.type === 'prepend') {
    const merged = mergeCandlePages(action.candles, state.candles);
    const candles = capCandles(merged, state.candles[0]?.openTime ?? 0);
    const { hasMore, reachedFrom } = action.paging;
    return { ...state, candles, hasMore, reachedFrom, isLoadingPrevious: false };
  }
  if (action.type === 'loadingPrevious') return { ...state, isLoadingPrevious: true };
  if (action.type === 'retry') {
    return { ...state, status: state.status === 'error' ? 'loading' : state.status };
  }
  const status = action.scope === 'series' || state.candles.length === 0 ? 'error' : state.status;
  return { ...state, status, isLoadingPrevious: false };
}
