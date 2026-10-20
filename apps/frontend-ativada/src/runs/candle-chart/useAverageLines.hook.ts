// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import { toSurfaceCandles } from './candle-series.js';
import type { ChartSurface } from './chart-surface.types.js';
import type { MarketCandle } from './market-candles.validation.js';
import { computeAverages } from './moving-average.js';
import { useIsTerminalChart } from './terminal-chart.context.js';

// MA20 e MA50 só no telão; fora dele a superfície não recebe média nenhuma.
export function useAverageLines(
  surface: ChartSurface | undefined,
  candles: readonly MarketCandle[],
): void {
  const isTerminal = useIsTerminalChart();
  useEffect(() => {
    if (surface === undefined || !isTerminal) return;
    surface.setAverages(computeAverages(toSurfaceCandles(candles)));
  }, [surface, candles, isTerminal]);
}
