// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { shouldRequestPreviousPage } from './candle-paging.js';
import type { ChartSurface, SurfaceLogicalRange } from './chart-surface.types.js';
import type { CandleHistory } from './useCandleHistory.hook.js';

export type CanvasInteractionsParams = {
  readonly surface: ChartSurface | undefined;
  readonly history: CandleHistory;
  // Clique numa vela (índice na lista carregada).
  readonly onPick: (candleIndex: number) => void;
  // Enquadra o gráfico depois de uma troca de série (par, vela ou faixa).
  readonly onReframe: () => void;
  // O centro visível é arredondado para blocos deste tamanho (ms) antes de virar estado: as camadas não pedem a cada arrasto.
  readonly blockMilliseconds: number;
};

export type CanvasInteractions = {
  // A vela apontada pela cruz; `null` com o mouse fora.
  readonly hoverIndex: number | null;
  // O instante da vela no centro do que está visível (para a troca de vela manter o centro).
  readonly centerTime: () => number | undefined;
  // O começo do bloco em que está o centro visível; `undefined` até o primeiro enquadramento.
  readonly blockTime: number | undefined;
};

function candleTimeAtCenter(
  history: CandleHistory,
  range: SurfaceLogicalRange,
): number | undefined {
  const last = history.candles.length - 1;
  const index = Math.min(Math.max(Math.round((range.from + range.to) / 2), 0), last);
  return history.candles[index]?.openTime;
}

// Liga a superfície ao estado da tela: cruz, clique, página anterior perto da borda esquerda e o reenquadramento.
export function useCanvasInteractions(params: CanvasInteractionsParams): CanvasInteractions {
  const { surface, history, onPick, onReframe, blockMilliseconds } = params;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [blockTime, setBlockTime] = useState<number | undefined>(undefined);
  const visible = useRef<SurfaceLogicalRange | undefined>(undefined);
  const handleRange = useEffectEvent((range: SurfaceLogicalRange): void => {
    visible.current = range;
    const center = candleTimeAtCenter(history, range);
    if (center !== undefined && blockMilliseconds > 0) {
      setBlockTime(Math.floor(center / blockMilliseconds) * blockMilliseconds);
    }
    const needsPage = shouldRequestPreviousPage({
      firstVisibleIndex: Math.floor(range.from),
      isLoading: history.isLoadingPrevious,
      hasMore: history.hasMore,
    });
    if (needsPage) history.loadPrevious();
  });
  const handleClick = useEffectEvent((index: number | null): void => {
    if (index !== null) onPick(index);
  });
  const handleReframe = useEffectEvent((): void => onReframe());
  useEffect(() => surface?.onCrosshairMove(setHoverIndex), [surface]);
  useEffect(() => surface?.onVisibleRangeChange(handleRange), [surface]);
  useEffect(() => surface?.onClick(handleClick), [surface]);
  useEffect(() => {
    if (surface !== undefined && history.generation > 0) handleReframe();
  }, [surface, history.generation]);
  const centerTime = (): number | undefined => {
    const range = visible.current;
    if (range === undefined) return history.candles.at(-1)?.openTime;
    return candleTimeAtCenter(history, range);
  };
  return { hoverIndex, centerTime, blockTime };
}
