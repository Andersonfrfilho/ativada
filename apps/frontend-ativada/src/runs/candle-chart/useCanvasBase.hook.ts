// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RefObject } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import type { Trade } from '../run.validation.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { useTradeRows } from '../useTradeRows.hook.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';
import { CHART_LAYER } from './candle-chart.constant.js';
import type { ChartSurface } from './chart-surface.types.js';
import type { CandleSource } from './useCandleSource.hook.js';
import { useChartSurface } from './useChartSurface.hook.js';
import { useSurfaceData } from './useSurfaceData.hook.js';
import { useSurfaceTheme } from './useSurfaceTheme.hook.js';

export type CanvasBaseInput = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly selection: TradeSelection;
  readonly source: CandleSource;
};

export type CanvasBase = {
  readonly timeZone: string;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly surface: ChartSurface | undefined;
  readonly hasFailed: boolean;
  // As operações da faixa (a mesma consulta da tabela e dos níveis): dão os colchetes das saídas na vela de exibição.
  readonly trades: readonly Trade[];
};

// A superfície com o tema e o que a tela já sabe empurrar para ela: velas, volume e as setas das operações.
export function useCanvasBase(input: CanvasBaseInput): CanvasBase {
  const { runId, chart, view, selection, source } = input;
  const timeZone = useUserTimeZone();
  const { containerRef, surface, hasFailed } = useChartSurface();
  const trades = useTradeRows(runId, view.queryRange).items;
  useSurfaceTheme(surface);
  useSurfaceData(surface, {
    candles: source.history.candles,
    markers: chart.markers,
    isTradesVisible: source.preferences.preferences.layers[CHART_LAYER.TRADES],
    selectedKey: selection.selectedKey,
    timeframeMilliseconds: source.durationMilliseconds,
    timeZone,
    trades,
    displayMapping: source.displayMapping,
  });
  return { timeZone, containerRef, surface, hasFailed, trades };
}
