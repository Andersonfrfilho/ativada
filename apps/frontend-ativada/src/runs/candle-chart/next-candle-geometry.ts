// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isRisingCandle, toDrawingNumber } from './candle-series.js';
import { CONE_STEPS } from './candle-chart.constant.js';
import type { CandleShape } from './market-candles.validation.js';
import { buildForming, buildTrail, pointText, round } from './next-candle-line.js';
import {
  PANEL_AXIS_WIDTH,
  PANEL_PLOT_HEIGHT,
  PANEL_TOP,
  PANEL_WIDTH,
  PAST_CANDLE_COUNT,
  type Layout,
  type PanelCandle,
  type PanelCone,
  type PanelInput,
  type PanelModel,
  type Scale,
} from './next-candle-model.js';
import { buildProjectionCone, toSurfaceProjection } from './projection-cone.js';
import type { AvailableProjection } from './projections.validation.js';

// A geometria do painel: escala de preço, velas recentes, meio-cone, linha plana e a linha do preço real. O `Number` do desenho
// vem de `toDrawingNumber` (RNF03); aqui só há escala e polígonos.
const PAST_SHARE = 0.42;
const RANGE_PADDING = 0.1;
const ARROW_SHARE = 0.55;
const ARROW_POSITION = 0.78;

function collectPrices(input: PanelInput): number[] {
  const prices = input.recent.flatMap((c) => [toDrawingNumber(c.high), toDrawingNumber(c.low)]);
  if (input.forming !== undefined) {
    prices.push(toDrawingNumber(input.forming.high), toDrawingNumber(input.forming.low));
  }
  prices.push(...input.trail.map((point) => toDrawingNumber(point.close)));
  const band = input.projection;
  if (band !== undefined && band.bandLow !== null && band.bandHigh !== null) {
    prices.push(toDrawingNumber(band.bandLow), toDrawingNumber(band.bandHigh));
  }
  return prices;
}

function createScale(prices: readonly number[]): Scale | undefined {
  if (prices.length === 0) return undefined;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const pad = (high - low) * RANGE_PADDING || Math.abs(high) * RANGE_PADDING || 1;
  const top = high + pad;
  const span = high - low + 2 * pad;
  return (price) => PANEL_TOP + ((top - price) / span) * PANEL_PLOT_HEIGHT;
}

function toPanelCandle(candle: CandleShape, x: number, scale: Scale): PanelCandle {
  const open = scale(toDrawingNumber(candle.open));
  const close = scale(toDrawingNumber(candle.close));
  return {
    x: round(x),
    wickTop: round(scale(toDrawingNumber(candle.high))),
    wickBottom: round(scale(toDrawingNumber(candle.low))),
    bodyTop: round(Math.min(open, close)),
    bodyHeight: round(Math.max(1, Math.abs(open - close))),
    isUp: isRisingCandle(candle),
  };
}
function buildCone(
  projection: AvailableProjection,
  scale: Scale,
  layout: Layout,
): PanelCone | undefined {
  const surface = toSurfaceProjection(projection);
  if (surface === null) return undefined;
  const cone = buildProjectionCone(surface, CONE_STEPS);
  const width = layout.right - layout.split;
  const upper = cone.points.map((p) =>
    pointText(layout.split + p.fraction * width, scale(p.upper)),
  );
  const lower = cone.points.map((p) =>
    pointText(layout.split + p.fraction * width, scale(p.lower)),
  );
  const baseY = scale(cone.base);
  const edge = cone.trendHalf === 'upper' ? upper : lower;
  const closing = [pointText(layout.right, baseY), pointText(layout.split, baseY)];
  const isBuy = surface.side === 'buy';
  const reach = isBuy ? surface.high - surface.base : surface.base - surface.low;
  const arrowPrice = surface.base + (isBuy ? 1 : -1) * reach * ARROW_SHARE;
  return {
    neutral: [...upper, ...[...lower].reverse()].join(' '),
    trend: [...edge, ...closing].join(' '),
    side: surface.side,
    lowY: round(scale(surface.low)),
    highY: round(scale(surface.high)),
    arrowX: round(layout.split + width * ARROW_POSITION),
    arrowY: round(scale(arrowPrice)),
  };
}
const EMPTY_MODEL: PanelModel = {
  split: 0,
  right: 0,
  bottom: PANEL_TOP + PANEL_PLOT_HEIGHT,
  past: [],
  baseY: undefined,
  cone: undefined,
  forming: undefined,
  trail: undefined,
  now: undefined,
};

// O desenho do painel: as últimas velas à esquerda, a vela que se forma à direita com o meio-cone da tendência, a linha plana
// no preço de partida e a linha do preço real chegando por cima. Sem tendência não há cone (RF16).
export function buildPanelModel(input: PanelInput): PanelModel {
  const scale = createScale(collectPrices(input));
  if (scale === undefined) return EMPTY_MODEL;
  const right = PANEL_WIDTH - PANEL_AXIS_WIDTH;
  const layout: Layout = { split: round(right * PAST_SHARE), right };
  const slot = layout.split / PAST_CANDLE_COUNT;
  const first = PAST_CANDLE_COUNT - input.recent.length;
  const past = input.recent.map((candle, index) =>
    toPanelCandle(candle, (first + index + 0.5) * slot, scale),
  );
  const { trail, now } = buildTrail(input, scale, layout);
  const baseClose = input.projection?.base ?? input.recent.at(-1)?.close;
  return {
    split: layout.split,
    right,
    bottom: EMPTY_MODEL.bottom,
    past,
    baseY: baseClose === undefined ? undefined : round(scale(toDrawingNumber(baseClose))),
    cone: input.projection === undefined ? undefined : buildCone(input.projection, scale, layout),
    forming: buildForming(input, scale, { layout, now }),
    trail,
    now,
  };
}
