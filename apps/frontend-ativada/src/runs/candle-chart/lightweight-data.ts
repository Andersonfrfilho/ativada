// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartSurface, SurfaceTheme } from './chart-surface.types.js';
import { paint, stamp, type Context } from './lightweight-context.js';
import {
  applyPricePrecision,
  RENDER_ALL,
  renderLevels,
  renderZones,
  renderPriceLevels,
  renderLines,
  renderAverages,
  renderLive,
  renderMarkers,
  renderProjection,
  renderScore,
  renderVolume,
} from './lightweight-render.js';
import { pricePrecisionFor } from './surface-format.js';
import type { ChartOptions, DeepPartial } from './lightweight-surface.js';

type SeriesSetters = Pick<
  ChartSurface,
  'setCandles' | 'setVolume' | 'setLines' | 'setAverages' | 'setScore' | 'setMarkers'
>;

type OverlaySetters = Pick<
  ChartSurface,
  | 'setWaited'
  | 'setLevels'
  | 'setZones'
  | 'setPriceLevels'
  | 'setProjection'
  | 'setLiveCandle'
  | 'setFormingSlot'
  | 'setRunStart'
  | 'setTheme'
>;

function themeOptions(ctx: Context, theme: SurfaceTheme): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ctx.kit.ColorType.Solid, color: theme.background },
      textColor: theme.text,
    },
    grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
    rightPriceScale: { borderColor: theme.grid },
    timeScale: { borderColor: theme.grid },
  };
}

// Cada setter guarda o dado e repinta só a camada dele; o tema repinta todas (o canvas não herda o CSS).
export function buildSeriesSetters(ctx: Context): SeriesSetters {
  const { state } = ctx;
  return {
    setCandles: (candles): void => {
      state.candles = candles;
      state.indexByTime = new Map(candles.map((candle, index) => [candle.time, index]));
      ctx.candles.setData(stamp(candles));
      const precision = pricePrecisionFor(candles.at(-1)?.close ?? 0);
      if (precision !== state.pricePrecision) {
        state.pricePrecision = precision;
        applyPricePrecision(ctx);
        paint(ctx, renderLines, renderAverages, renderProjection);
      }
      paint(ctx, renderLive);
    },
    setVolume: (bars): void => {
      state.volume = bars;
      paint(ctx, renderVolume);
    },
    setLines: (lines): void => {
      state.lines = lines;
      paint(ctx, renderLines);
    },
    setAverages: (averages): void => {
      state.averages = averages;
      paint(ctx, renderAverages);
    },
    setScore: (bars, thresholds): void => {
      state.scoreBars = bars;
      state.thresholds = thresholds;
      paint(ctx, renderScore);
    },
    setMarkers: (markers): void => {
      state.markers = markers;
      paint(ctx, renderMarkers);
    },
  };
}

// As plaquinhas das equipes ◆ dividem a lista de marcadores da biblioteca com as compras, as vendas e o "esperou".
export function buildTeamSetters(ctx: Context): Pick<ChartSurface, 'setTeamPlaques'> {
  return {
    setTeamPlaques: (plaques): void => {
      ctx.state.teamPlaques = plaques;
      paint(ctx, renderMarkers);
    },
  };
}

export function buildOverlaySetters(ctx: Context): OverlaySetters {
  const { state } = ctx;
  return {
    setWaited: (times): void => {
      state.waited = times;
      paint(ctx, renderMarkers);
    },
    setLevels: (boxes): void => {
      state.levels = boxes;
      paint(ctx, renderLevels);
    },
    setZones: (zones): void => {
      state.zones = zones;
      paint(ctx, renderZones);
    },
    setPriceLevels: (levels): void => {
      state.priceLevels = levels;
      paint(ctx, renderPriceLevels);
    },
    setProjection: (projection): void => {
      state.projection = projection;
      paint(ctx, renderProjection);
    },
    setLiveCandle: (candle): void => {
      state.live = candle;
      paint(ctx, renderLive);
    },
    setRunStart: (time): void => {
      state.runStart = time;
    },
    setFormingSlot: (slot): void => {
      state.formingSlot = slot;
    },
    setTheme: (theme): void => {
      state.theme = theme;
      ctx.chart.applyOptions(themeOptions(ctx, theme));
      paint(ctx, ...RENDER_ALL);
    },
  };
}
