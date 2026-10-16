// Copyright (c) 2026 Ada Technology. All rights reserved.
import { stamp, type Context, type Render } from './lightweight-context.js';
import type { SeriesPartialOptionsMap } from './lightweight-surface.js';
import { pricePriceFormat, SCORE_PRICE_FORMAT } from './surface-format.js';
import {
  buildCandleColors,
  buildConeEdges,
  buildFormingColors,
  buildLevelColors,
  buildLevelLineColors,
  buildMarkColors,
  buildMarkerSpecs,
  buildScoreData,
  buildThresholdLines,
  buildVolumeData,
  chooseLineStyle,
} from './surface-style.js';

const PANE_SCORE = 2;
const SCORE_STRETCH = 1.6;

function lineOptions(
  ctx: Context,
  look: { readonly color: string; readonly isDashed: boolean; readonly width: 1 | 2 },
): SeriesPartialOptionsMap['Line'] {
  const { Dashed, Solid } = ctx.kit.LineStyle;
  return {
    color: look.color,
    lineWidth: look.width,
    lineStyle: look.isDashed ? Dashed : Solid,
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat: pricePriceFormat(ctx.state.pricePrecision),
  };
}

// A grandeza do preço muda as casas do eixo (BTC 2, SHIB 8): as séries de preço trocam o formato de uma vez.
export function applyPricePrecision(ctx: Context): void {
  const priceFormat = pricePriceFormat(ctx.state.pricePrecision);
  [ctx.candles, ctx.forming, ctx.realPrice].forEach((series) =>
    series.applyOptions({ priceFormat }),
  );
}

export const renderLines: Render = (ctx, theme) => {
  ctx.layers.lines.forEach((series) => ctx.chart.removeSeries(series));
  ctx.layers.lines = ctx.state.lines.map((line) => {
    const look = { ...chooseLineStyle(line.role, theme), width: 1 } as const;
    const series = ctx.chart.addSeries(ctx.kit.LineSeries, lineOptions(ctx, look));
    series.setData(stamp(line.points));
    return series;
  });
};

function dropScore(ctx: Context): void {
  if (ctx.layers.score !== undefined) ctx.chart.removeSeries(ctx.layers.score);
  ctx.layers.score = undefined;
}

export const renderScore: Render = (ctx, theme) => {
  const { chart, kit, layers, state } = ctx;
  layers.scoreLevels.forEach((level) => layers.score?.removePriceLine(level));
  layers.scoreLevels = [];
  if (state.scoreBars.length === 0) return dropScore(ctx);
  if (layers.score === undefined) {
    layers.score = chart.addSeries(
      kit.HistogramSeries,
      { priceFormat: SCORE_PRICE_FORMAT, lastValueVisible: false },
      PANE_SCORE,
    );
    chart.panes()[PANE_SCORE]?.setStretchFactor(SCORE_STRETCH);
  }
  const { score } = layers;
  score.setData(stamp(buildScoreData(state.scoreBars, theme)));
  layers.scoreLevels = buildThresholdLines(state.thresholds, theme).map((line) =>
    score.createPriceLine({ ...line, lineWidth: 1, lineStyle: kit.LineStyle.Dashed }),
  );
};

export const renderProjection: Render = (ctx, theme) => {
  ctx.layers.cone.forEach((series) => ctx.chart.removeSeries(series));
  const { projection } = ctx.state;
  const edges = projection === null ? [] : buildConeEdges(projection, theme);
  ctx.layers.cone = edges.map((edge) => {
    const width = edge.key === 'base' ? 1 : 2;
    const options = lineOptions(ctx, { color: edge.color, isDashed: edge.isDashed, width });
    const series = ctx.chart.addSeries(ctx.kit.LineSeries, options);
    series.setData(stamp(edge.points));
    return series;
  });
};

export const renderLive: Render = (ctx, theme) => {
  const { live, candles } = ctx.state;
  const anchor = candles.at(-1);
  ctx.forming.applyOptions({ ...buildFormingColors(theme), borderVisible: true });
  ctx.forming.setData(live === null ? [] : stamp([live]));
  ctx.realPrice.applyOptions({ color: theme.line });
  const isAfterAnchor = live !== null && anchor !== undefined && live.time > anchor.time;
  const points = isAfterAnchor
    ? [
        { time: anchor.time, value: anchor.close },
        { time: live.time, value: live.close },
      ]
    : [];
  ctx.realPrice.setData(stamp(points));
};

export const renderVolume: Render = (ctx, theme) =>
  ctx.volume.setData(stamp(buildVolumeData(ctx.state.volume, theme)));

export const renderMarkers: Render = (ctx, theme) => {
  ctx.markers.setMarkers(stamp(buildMarkerSpecs(ctx.state.markers, ctx.state.waited, theme)));
  ctx.marks.update(ctx.state.markers, buildMarkColors(theme));
};

export const renderLevels: Render = (ctx, theme) =>
  ctx.boxes.update(ctx.state.levels, buildLevelColors(theme));

const renderCandleColors: Render = (ctx, theme) =>
  ctx.candles.applyOptions(buildCandleColors(theme));

export const renderPriceLevels: Render = (ctx, theme) => {
  ctx.layers.levelLines.forEach((line) => ctx.candles.removePriceLine(line));
  ctx.layers.levelLines = ctx.state.priceLevels.map((level) =>
    ctx.candles.createPriceLine({
      price: level.price,
      title: level.title,
      color: buildLevelLineColors(theme)[level.role],
      lineWidth: 2,
      lineStyle: ctx.kit.LineStyle.Dashed,
      axisLabelVisible: true,
    }),
  );
};

export const RENDER_ALL: readonly Render[] = [
  renderCandleColors,
  renderVolume,
  renderLines,
  renderScore,
  renderMarkers,
  renderProjection,
  renderLive,
  renderLevels,
  renderPriceLevels,
];
