// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import type { StreamCandle } from '../../live/stream.validation.js';
import { useLiveCandle } from '../../live/useLiveCandle.hook.js';
import { useClock } from '../../live/useClock.hook.js';
import { timeframeMilliseconds } from '../live-chart.js';
import type { TradeChart } from '../trade-chart.validation.js';
import { buildPanelModel } from './next-candle-geometry.js';
import { PAST_CANDLE_COUNT, type PanelModel } from './next-candle-model.js';
import type { NextCandleLabels } from './NextCandleChart.component.js';
import { buildPanelLabels } from './next-candle-labels.js';
import {
  computePanelWindow,
  isPanelDrawable,
  judgeNextCandle,
  type NextCandleState,
  type PanelWindow,
} from './next-candle-state.js';
import { useMarketCandlesQuery } from './candle-chart.query.js';
import { findRecentResult, type ResultView } from './projection-text.js';
import type { MarketCandle } from './market-candles.validation.js';
import type { PriceTrail } from './price-trail.js';
import { usePriceTrail } from './usePriceTrail.hook.js';
import type { ChartLayerData } from './useChartLayers.hook.js';

const CLOCK_MILLISECONDS = 5_000;
const NO_CANDLES: readonly MarketCandle[] = [];

export type NextCandleView = {
  readonly state: NextCandleState;
  readonly now: number;
  readonly timeZone: string;
  readonly window: PanelWindow | undefined;
  // Só quando há o que desenhar: o modelo e os rótulos andam juntos.
  readonly drawing: { readonly model: PanelModel; readonly labels: NextCandleLabels } | undefined;
  readonly result: ResultView | undefined;
  // O fechamento parcial da vela em formação, texto decimal do servidor.
  readonly priceNow: string | undefined;
};

export type NextCandleInput = { readonly chart: TradeChart; readonly layerData: ChartLayerData };

function useRecentCandles(
  chart: TradeChart,
  window: PanelWindow | undefined,
  duration: number,
): readonly MarketCandle[] {
  // Alinhado à grade da vela: o início da janela anda com o relógio e uma chave nova a cada passo refaria o pedido sem necessidade.
  const gridEnd = duration > 0 ? Math.floor((window?.start ?? 0) / duration) * duration : 0;
  const query = useMarketCandlesQuery({
    symbol: chart.symbol,
    timeframe: chart.timeframe,
    from: gridEnd - PAST_CANDLE_COUNT * duration,
    to: gridEnd,
    isEnabled: window !== undefined,
  });
  return window === undefined ? NO_CANDLES : (query.data ?? NO_CANDLES).slice(-PAST_CANDLE_COUNT);
}

type Drawing = NonNullable<NextCandleView['drawing']>;

type DrawingInput = {
  readonly state: NextCandleState;
  readonly window: PanelWindow;
  readonly recent: readonly MarketCandle[];
  readonly forming: StreamCandle | undefined;
  readonly trail: PriceTrail;
  readonly timeZone: string;
};

function buildDrawing({ state, window, recent, forming, trail, timeZone }: DrawingInput): Drawing {
  const model = buildPanelModel({
    recent,
    forming,
    trail: forming === undefined ? [] : trail.points,
    window,
    projection: state.kind === 'available' ? state.current : undefined,
  });
  return { model, labels: buildPanelLabels({ state, window, timeZone }) };
}

// Tudo o que o painel "Próxima vela de perto" mostra: o estado da previsão (RF16), as velas recentes, a vela em formação com
// a linha do preço real, o desenho e o resultado da previsão anterior. Nada é calculado aqui: números e frases vêm do servidor.
export function useNextCandle({ chart, layerData }: NextCandleInput): NextCandleView {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const live = useLiveCandle(chart.symbol, chart.timeframe);
  const forming = live?.status === 'forming' ? live.candle : undefined;
  const trail = usePriceTrail(forming);
  const state = judgeNextCandle({
    isStrategyTimeframe: layerData.isStrategyTimeframe,
    runTimeframe: chart.timeframe,
    projection: layerData.projection,
    isError: layerData.isProjectionError,
    live,
    now,
  });
  const duration = timeframeMilliseconds(chart.timeframe) ?? 0;
  const window = isPanelDrawable(state) ? computePanelWindow(state, duration, now) : undefined;
  const recent = useRecentCandles(chart, window, duration);
  const drawing =
    window === undefined
      ? undefined
      : buildDrawing({ state, window, recent, forming, trail, timeZone });
  const items = layerData.projections?.items ?? [];
  const result = layerData.isStrategyTimeframe ? findRecentResult(items) : undefined;
  return { state, now, timeZone, window, drawing, result, priceNow: forming?.close };
}
