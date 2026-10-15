// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import type { LiveCandleView } from '../../live/live-candle.js';
import { useLiveCandle } from '../../live/useLiveCandle.hook.js';
import { toSurfaceCandle } from './candle-series.js';
import type { ChartSurface } from './chart-surface.types.js';

export type FormingCandleParams = {
  readonly symbol: string;
  readonly timeframe: string;
  // Só a simulação ao vivo que acompanha o fim tem vela em formação à vista: com faixa fixa o gráfico não anda.
  readonly isFollowing: boolean;
};

// A vela que se forma agora (D9): entra na superfície como vela em formação, sem tocar nas velas fechadas, no placar nem
// nas linhas (a decisão é sempre da vela fechada). Quando o preço para de chegar a vela some e a tela diz "sem dados".
export function useFormingCandle(
  surface: ChartSurface | undefined,
  params: FormingCandleParams,
): LiveCandleView | undefined {
  const live = useLiveCandle(params.symbol, params.timeframe);
  const view = params.isFollowing ? live : undefined;
  const forming = view?.status === 'forming' ? view.candle : undefined;
  useEffect(() => {
    surface?.setLiveCandle(forming === undefined ? null : toSurfaceCandle(forming));
  }, [surface, forming]);
  return view;
}
