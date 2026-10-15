// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RefObject } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatSymbol } from '../../format/format.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';
import { CHART_LAYER, INITIAL_VISIBLE_BARS, type ChartLayer } from './candle-chart.constant.js';
import { toSurfaceTime } from './candle-series.js';
import type { ChartSurface } from './chart-surface.types.js';
import { LAYERS_BLOCK_BARS } from './layer-series.js';
import { findPositionKeyAt } from './marker-series.js';
import { buildOhlcText, type OhlcText } from './ohlc-text.js';
import { useCanvasInteractions } from './useCanvasInteractions.hook.js';
import type { CandleSource, TimeframeChoice } from './useCandleSource.hook.js';
import { useChartLayers, type ChartLayerData } from './useChartLayers.hook.js';
import { useChartSurface } from './useChartSurface.hook.js';
import { useLayerSurface } from './useLayerSurface.hook.js';
import { useSurfaceData } from './useSurfaceData.hook.js';
import { useSurfaceTheme } from './useSurfaceTheme.hook.js';

export type CandleCanvasInput = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly selection: TradeSelection;
  readonly source: CandleSource;
};

export type CandleCanvasModel = {
  readonly timeZone: string;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly surface: ChartSurface | undefined;
  readonly hasFailed: boolean;
  readonly legend: OhlcText | undefined;
  readonly layerData: ChartLayerData;
  readonly isLayerOn: (layer: ChartLayer) => boolean;
  readonly handleTimeframeChange: (next: TimeframeChoice) => void;
};

type CanvasBase = Pick<CandleCanvasModel, 'timeZone' | 'containerRef' | 'surface' | 'hasFailed'>;

// A superfície com o tema e o que a tela já sabe empurrar para ela: velas, volume e as setas das operações.
function useCanvasBase(input: CandleCanvasInput): CanvasBase {
  const { chart, selection, source } = input;
  const timeZone = useUserTimeZone();
  const { containerRef, surface, hasFailed } = useChartSurface();
  useSurfaceTheme(surface);
  useSurfaceData(surface, {
    candles: source.history.candles,
    markers: chart.markers,
    isTradesVisible: source.preferences.preferences.layers[CHART_LAYER.TRADES],
    selectedKey: selection.selectedKey,
    timeframeMilliseconds: source.durationMilliseconds,
    timeZone,
  });
  return { timeZone, containerRef, surface, hasFailed };
}

// Depois de trocar a série: o instante em foco no centro, a faixa da URL inteira, ou as últimas velas ao acompanhar o fim.
function reframe(surface: ChartSurface | undefined, input: CandleCanvasInput): void {
  const { source, view } = input;
  if (source.focus !== undefined) surface?.centerOn(toSurfaceTime(source.focus));
  else if (view.range !== undefined) surface?.fit();
  else surface?.showLast(INITIAL_VISIBLE_BARS);
}

// Clicar numa vela com seta seleciona a operação (a mesma chave da linha da tabela); não mexe na faixa.
function selectOperationAt(index: number, input: CandleCanvasInput): void {
  const { chart, selection, source } = input;
  const open = source.history.candles[index]?.openTime;
  if (open === undefined) return;
  const key = findPositionKeyAt(chart.markers, open, source.durationMilliseconds);
  if (key !== undefined) selection.select({ key, range: undefined });
}

function buildLegend(
  input: CandleCanvasInput,
  index: number,
  timeZone: string,
): OhlcText | undefined {
  const { chart, source } = input;
  const { candles } = source.history;
  const candle = candles[index];
  if (candle === undefined) return undefined;
  return buildOhlcText({
    candle,
    previousClose: candles[index - 1]?.close,
    symbol: formatSymbol(chart.symbol),
    timeframe: source.timeframe,
    timeZone,
    isForming: false,
  });
}

// Tudo o que o gráfico precisa ligar: a superfície e seu tema, os dados, a cruz, o clique, a página anterior, o
// reenquadramento e as camadas. O componente só desenha o resultado.
export function useCandleCanvasModel(input: CandleCanvasInput): CandleCanvasModel {
  const { runId, chart, view, source } = input;
  const base = useCanvasBase(input);
  const interactions = useCanvasInteractions({
    surface: base.surface,
    history: source.history,
    onPick: (index) => selectOperationAt(index, input),
    onReframe: () => reframe(base.surface, input),
    blockMilliseconds: LAYERS_BLOCK_BARS * source.durationMilliseconds,
  });
  const layerData = useChartLayers({
    runId,
    chart,
    view,
    source,
    centerTime: interactions.blockTime,
  });
  const isLayerOn = (layer: ChartLayer): boolean => source.preferences.preferences.layers[layer];
  useLayerSurface(base.surface, { data: layerData, decisions: chart.decisions, isOn: isLayerOn });
  const index = interactions.hoverIndex ?? source.history.candles.length - 1;
  return {
    ...base,
    layerData,
    isLayerOn,
    legend: buildLegend(input, index, base.timeZone),
    handleTimeframeChange: (next): void => {
      const center = interactions.centerTime();
      if (center !== undefined) source.changeTimeframe(next, center);
    },
  };
}
