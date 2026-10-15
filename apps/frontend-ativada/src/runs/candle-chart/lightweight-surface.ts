// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
} from 'lightweight-charts';

import type { ChartSurface } from './chart-surface.types.js';
import { toTime, type Context } from './lightweight-context.js';
import { buildOverlaySetters, buildSeriesSetters } from './lightweight-data.js';
import { buildEvents, buildView } from './lightweight-view.js';
import { LevelBoxesPrimitive } from './level-boxes-primitive.js';
import { DEFAULT_PRECISION, pricePriceFormat, VOLUME_PRICE_FORMAT } from './surface-format.js';
import { createSurfaceState } from './surface-state.js';

// O ÚNICO arquivo que importa `lightweight-charts` (P14): o resto do painel só conhece a porta `ChartSurface`. Os irmãos
// `lightweight-*.ts` recebem os valores por `kit` e os tipos por estas reexportações (só tipos, apagadas no build).
// Painéis: preço (velas, linhas, marcadores, cone), volume e placar; o placar só existe enquanto há camadas.
export type {
  ChartOptions,
  DeepPartial,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  MouseEventParams,
  SeriesPartialOptionsMap,
  TickMarkType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

const KIT = {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
} as const;

export type LibraryKit = typeof KIT;

const PANE = { PRICE: 0, VOLUME: 1 } as const;
const STRETCH = { PRICE: 5, VOLUME: 1.2 } as const;

function createContext(chart: IChartApi): Context {
  const priceFormat = pricePriceFormat(DEFAULT_PRECISION);
  const candles = chart.addSeries(CandlestickSeries, { priceFormat }, PANE.PRICE);
  const volumeOptions = { priceFormat: VOLUME_PRICE_FORMAT, lastValueVisible: false };
  const volume = chart.addSeries(HistogramSeries, volumeOptions, PANE.VOLUME);
  const forming = chart.addSeries(
    CandlestickSeries,
    { priceFormat, lastValueVisible: false },
    PANE.PRICE,
  );
  const realPrice = chart.addSeries(
    LineSeries,
    { priceFormat, lineWidth: 2, title: 'agora' },
    PANE.PRICE,
  );
  const boxes = new LevelBoxesPrimitive({
    timeToX: (seconds): number | null => chart.timeScale().timeToCoordinate(toTime(seconds)),
    priceToY: (price): number | null => candles.priceToCoordinate(price),
    paneWidth: (): number => chart.timeScale().width(),
  });
  candles.attachPrimitive(boxes);
  chart.panes()[PANE.PRICE]?.setStretchFactor(STRETCH.PRICE);
  chart.panes()[PANE.VOLUME]?.setStretchFactor(STRETCH.VOLUME);
  return {
    kit: KIT,
    chart,
    candles,
    volume,
    forming,
    realPrice,
    boxes,
    markers: createSeriesMarkers(candles, []),
    state: createSurfaceState(),
    layers: { lines: [], cone: [], score: undefined, scoreLevels: [] },
    crosshairListeners: new Set(),
  };
}

export function createLightweightSurface(container: HTMLElement): ChartSurface {
  const chart = createChart(container, {
    autoSize: true,
    layout: { attributionLogo: false },
    localization: { locale: 'pt-BR' },
    crosshair: { mode: CrosshairMode.Normal },
    timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6 },
  });
  const ctx = createContext(chart);
  return {
    ...buildSeriesSetters(ctx),
    ...buildOverlaySetters(ctx),
    ...buildEvents(ctx),
    ...buildView(ctx),
  };
}
