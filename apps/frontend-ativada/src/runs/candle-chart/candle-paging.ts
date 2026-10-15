// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CANDLE_PAGE_SIZE,
  MAX_CANDLES_IN_MEMORY,
  PAGING_EDGE_BARS,
} from './candle-chart.constant.js';

type TimedCandle = { readonly openTime: number };

export type PageRequestState = {
  // Índice lógico da primeira vela visível (0 = a vela mais antiga carregada).
  readonly firstVisibleIndex: number;
  readonly isLoading: boolean;
  readonly hasMore: boolean;
};

export type PreviousPageParams = {
  readonly firstOpenTime: number;
  readonly timeframeMilliseconds: number;
  // Nada antes disto interessa (a vela mais antiga que o par tem).
  readonly earliestTime: number;
};

export type PageRange = { readonly from: number; readonly to: number };

// A página anterior carrega sozinha quando a janela chega perto da borda esquerda; um pedido por vez.
export function shouldRequestPreviousPage(state: PageRequestState): boolean {
  return state.hasMore && !state.isLoading && state.firstVisibleIndex < PAGING_EDGE_BARS;
}

// `[from, to)` em ms UTC, terminando na primeira vela que já temos: a vela de `to` não vem de novo.
export function previousPageRange(params: PreviousPageParams): PageRange | undefined {
  const from = Math.max(
    params.earliestTime,
    params.firstOpenTime - CANDLE_PAGE_SIZE * params.timeframeMilliseconds,
  );
  return from < params.firstOpenTime ? { from, to: params.firstOpenTime } : undefined;
}

// Junta páginas sem repetir vela (a mais nova do mesmo `openTime` vale) e em ordem de tempo.
export function mergeCandlePages<TCandle extends TimedCandle>(
  current: readonly TCandle[],
  incoming: readonly TCandle[],
): TCandle[] {
  const byOpenTime = new Map<number, TCandle>();
  for (const candle of [...current, ...incoming]) byOpenTime.set(candle.openTime, candle);
  return [...byOpenTime.values()].sort((left, right) => left.openTime - right.openTime);
}

// Teto de memória: descarta as velas mais distantes do instante em foco, de qualquer uma das pontas.
export function capCandles<TCandle extends TimedCandle>(
  candles: readonly TCandle[],
  focusTime: number,
): TCandle[] {
  let start = 0;
  let end = candles.length;
  while (end - start > MAX_CANDLES_IN_MEMORY) {
    const first = candles[start]?.openTime ?? focusTime;
    const last = candles[end - 1]?.openTime ?? focusTime;
    if (focusTime - first >= last - focusTime) start += 1;
    else end -= 1;
  }
  return candles.slice(start, end);
}
