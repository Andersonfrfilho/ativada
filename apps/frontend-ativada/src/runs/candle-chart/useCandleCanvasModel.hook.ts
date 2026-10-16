// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RefObject } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatSymbol } from '../../format/format.js';
import type { LiveCandleView } from '../../live/live-candle.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';
import { CHART_LAYER, INITIAL_VISIBLE_BARS, type ChartLayer } from './candle-chart.constant.js';
import { toSurfaceTime } from './candle-series.js';
import { describeForecast } from './forecast-description.js';
import { judgeNextCandle } from './next-candle-state.js';
import type { ChartSurface } from './chart-surface.types.js';
import { LAYERS_BLOCK_BARS } from './layer-series.js';
import { buildLegendText } from './legend-text.js';
import { findPositionKeyAt } from './marker-series.js';
import type { OhlcText } from './ohlc-text.js';
import { useCanvasInteractions } from './useCanvasInteractions.hook.js';
import { useChartKeyboard, type ChartKeyboard } from './useChartKeyboard.hook.js';
import type { CandleSource, TimeframeChoice } from './useCandleSource.hook.js';
import { useChartLayers, type ChartLayerData } from './useChartLayers.hook.js';
import { useChartSurface } from './useChartSurface.hook.js';
import { useFormingCandle } from './useFormingCandle.hook.js';
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
  readonly live: LiveCandleView | undefined;
  readonly layerData: ChartLayerData;
  readonly isLayerOn: (layer: ChartLayer) => boolean;
  readonly handleTimeframeChange: (next: TimeframeChoice) => void;
  readonly keyboard: ChartKeyboard;
  // A abertura da vela que a cruz aponta (mouse ou teclado); a equipe junto do gráfico fala dela.
  readonly pointedOpenTime: number | undefined;
  // A frase da previsão para a descrição textual (RF20); `undefined` sem camada de previsão ou sem resposta.
  readonly forecastText: string | undefined;
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

type LegendContext = {
  readonly hoverIndex: number | null;
  readonly live: LiveCandleView | undefined;
  readonly timeZone: string;
};

function legendFor(input: CandleCanvasInput, context: LegendContext): OhlcText | undefined {
  const { chart, source } = input;
  return buildLegendText({
    closed: source.history.candles,
    index: context.hoverIndex,
    forming: context.live?.status === 'forming' ? context.live.candle : undefined,
    symbol: formatSymbol(chart.symbol),
    timeframe: source.timeframe,
    timeZone: context.timeZone,
  });
}

function forecastTextFor(
  runTimeframe: string,
  layers: LayerModel,
  timeZone: string,
): string | undefined {
  const now = Date.now();
  const state = judgeNextCandle({
    isStrategyTimeframe: layers.layerData.isStrategyTimeframe,
    runTimeframe,
    projection: layers.layerData.projection,
    isError: layers.layerData.isProjectionError,
    live: layers.live,
    now,
  });
  return describeForecast({ state, now, timeZone });
}

type LayerModel = Pick<CandleCanvasModel, 'layerData' | 'isLayerOn' | 'live'>;

// As camadas da estratégia na superfície e a vela em formação.
function useLayerModel(
  input: CandleCanvasInput,
  base: CanvasBase,
  blockTime: number | undefined,
): LayerModel {
  const { runId, chart, view, source } = input;
  const layerData = useChartLayers({ runId, chart, view, source, centerTime: blockTime });
  const isLayerOn = (layer: ChartLayer): boolean => source.preferences.preferences.layers[layer];
  useLayerSurface(base.surface, { data: layerData, decisions: chart.decisions, isOn: isLayerOn });
  const live = useFormingCandle(base.surface, {
    symbol: chart.symbol,
    timeframe: source.timeframe,
    isFollowing: view.isLive && view.range === undefined,
  });
  return { layerData, isLayerOn, live };
}

// Tudo o que o gráfico precisa ligar: a superfície e seu tema, os dados, a cruz (mouse e teclado), o clique, a página
// anterior, o reenquadramento, as camadas e a vela em formação. O componente só desenha o resultado.
export function useCandleCanvasModel(input: CandleCanvasInput): CandleCanvasModel {
  const { chart, source } = input;
  const base = useCanvasBase(input);
  const pick = (index: number): void => selectOperationAt(index, input);
  const interactions = useCanvasInteractions({
    surface: base.surface,
    history: source.history,
    onPick: pick,
    onReframe: () => reframe(base.surface, input),
    blockMilliseconds: LAYERS_BLOCK_BARS * source.durationMilliseconds,
  });
  const layers = useLayerModel(input, base, interactions.blockTime);
  const keyboard = useChartKeyboard({
    surface: base.surface,
    candles: source.history.candles,
    markers: chart.markers,
    durationMilliseconds: source.durationMilliseconds,
    symbol: formatSymbol(chart.symbol),
    timeframe: source.timeframe,
    timeZone: base.timeZone,
    isVisible: interactions.isVisible,
    onPick: pick,
  });
  const pointed = interactions.hoverIndex ?? keyboard.index;
  return {
    ...base,
    ...layers,
    keyboard,
    pointedOpenTime: pointed === null ? undefined : source.history.candles[pointed]?.openTime,
    forecastText: forecastTextFor(chart.timeframe, layers, base.timeZone),
    legend: legendFor(input, { hoverIndex: pointed, live: layers.live, timeZone: base.timeZone }),
    handleTimeframeChange: (next): void => {
      const center = interactions.centerTime();
      if (center !== undefined) source.changeTimeframe(next, center);
    },
  };
}
