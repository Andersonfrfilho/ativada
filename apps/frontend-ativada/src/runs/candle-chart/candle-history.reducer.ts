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
  readonly isLoadingPrevious: boolean;
};

export type HistoryAction =
  | {
      readonly type: 'replace';
      readonly candles: readonly MarketCandle[];
      readonly timeframe: string;
      readonly hasMore: boolean;
    }
  | { readonly type: 'append'; readonly candles: readonly MarketCandle[] }
  | {
      readonly type: 'prepend';
      readonly candles: readonly MarketCandle[];
      readonly hasMore: boolean;
    }
  | { readonly type: 'loadingPrevious' }
  | { readonly type: 'failed' };

export const INITIAL_HISTORY_STATE: HistoryState = {
  candles: [],
  timeframe: undefined,
  status: 'loading',
  generation: 0,
  hasMore: false,
  isLoadingPrevious: false,
};

export function reduceHistory(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'replace') {
    return {
      candles: action.candles,
      timeframe: action.timeframe,
      status: 'ready',
      generation: state.generation + 1,
      hasMore: action.hasMore,
      isLoadingPrevious: false,
    };
  }
  if (action.type === 'append') {
    return { ...state, candles: mergeCandlePages(state.candles, action.candles) };
  }
  if (action.type === 'prepend') {
    const merged = mergeCandlePages(action.candles, state.candles);
    const candles = capCandles(merged, state.candles[0]?.openTime ?? 0);
    return { ...state, candles, hasMore: action.hasMore, isLoadingPrevious: false };
  }
  if (action.type === 'loadingPrevious') return { ...state, isLoadingPrevious: true };
  const status = state.candles.length === 0 ? 'error' : state.status;
  return { ...state, status, hasMore: false, isLoadingPrevious: false };
}
