// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartSurface } from './chart-surface.types.js';
import { toTime, type Context } from './lightweight-context.js';
import { computeLastBarsWidth } from './visible-bars.js';
import type { MouseEventParams, Time, TickMarkType } from './lightweight-surface.js';

// O tempo desta biblioteca é sempre o inteiro em segundos que o adaptador deu; outro formato não existe aqui.
const toSeconds = (time: Time): number => (typeof time === 'number' ? time : 0);
const ZOOM_BASE = 0.75;
const MIN_VISIBLE_BARS = 5;
const RIGHT_MARGIN_BARS = 6;

function indexOfEvent(ctx: Context, params: MouseEventParams<Time>): number | null {
  const { time } = params;
  return typeof time === 'number' ? (ctx.state.indexByTime.get(time) ?? null) : null;
}

type EventSubscriptions = Pick<
  ChartSurface,
  'onCrosshairMove' | 'onClick' | 'onVisibleRangeChange'
>;

export function buildEvents(ctx: Context): EventSubscriptions {
  const { chart } = ctx;
  return {
    onCrosshairMove: (listener): (() => void) => {
      const handler = (params: MouseEventParams<Time>): void => listener(indexOfEvent(ctx, params));
      chart.subscribeCrosshairMove(handler);
      ctx.crosshairListeners.add(listener);
      return () => {
        chart.unsubscribeCrosshairMove(handler);
        ctx.crosshairListeners.delete(listener);
      };
    },
    onClick: (listener): (() => void) => {
      const handler = (params: MouseEventParams<Time>): void => listener(indexOfEvent(ctx, params));
      chart.subscribeClick(handler);
      return () => chart.unsubscribeClick(handler);
    },
    onVisibleRangeChange: (listener): (() => void) => {
      const handler = (range: { from: number; to: number } | null): void => {
        if (range !== null) listener({ from: range.from, to: range.to });
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    },
  };
}

type ViewControls = Pick<
  ChartSurface,
  | 'zoom'
  | 'fit'
  | 'showLast'
  | 'scrollToEnd'
  | 'centerOn'
  | 'setCrosshair'
  | 'setTimeLabels'
  | 'destroy'
>;

// A biblioteca avisa os ouvintes quando a cruz é posta por código, mas não quando é apagada: o adaptador avisa `null`, senão a
// legenda fica presa na vela que o teclado apontou por último.
function placeCrosshair(ctx: Context, index: number | null): void {
  const candle = index === null ? undefined : ctx.state.candles[index];
  if (candle !== undefined) {
    ctx.chart.setCrosshairPosition(candle.close, toTime(candle.time), ctx.candles);
    return;
  }
  ctx.chart.clearCrosshairPosition();
  ctx.crosshairListeners.forEach((listener) => listener(null));
}

type ShowLastParams = {
  readonly ctx: Context;
  readonly bars: number;
  readonly showRange: (center: number, width: number) => void;
};

function showLastBars({ ctx, bars, showRange }: ShowLastParams): void {
  const count = ctx.state.candles.length;
  const width = computeLastBarsWidth({
    candleCount: count,
    bars,
    rightMarginBars: RIGHT_MARGIN_BARS,
  });
  showRange(count - 1 - width / 2 + RIGHT_MARGIN_BARS, width);
}

export function buildView(ctx: Context): ViewControls {
  const { chart, kit } = ctx;
  const scale = chart.timeScale();
  const showRange = (center: number, width: number): void => {
    const half = Math.max(width, MIN_VISIBLE_BARS) / 2;
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };
  const isClockTick = (type: TickMarkType): boolean =>
    type === kit.TickMarkType.Time || type === kit.TickMarkType.TimeWithSeconds;
  return {
    zoom: (step): void => {
      const range = scale.getVisibleLogicalRange();
      if (range === null) return;
      showRange((range.from + range.to) / 2, (range.to - range.from) * ZOOM_BASE ** step);
    },
    fit: (): void => scale.fitContent(),
    showLast: (bars): void => showLastBars({ ctx, bars, showRange }),
    scrollToEnd: (): void => scale.scrollToRealTime(),
    centerOn: (time): void => {
      const range = scale.getVisibleLogicalRange();
      const index = scale.timeToIndex(toTime(time), true);
      if (range !== null && index !== null) showRange(index, range.to - range.from);
    },
    setCrosshair: (index): void => placeCrosshair(ctx, index),
    setTimeLabels: (labels): void =>
      chart.applyOptions({
        localization: { timeFormatter: (time: Time) => labels.full(toSeconds(time)) },
        timeScale: {
          tickMarkFormatter: (time: Time, type: TickMarkType) =>
            isClockTick(type) ? labels.time(toSeconds(time)) : labels.day(toSeconds(time)),
        },
      }),
    destroy: (): void => chart.remove(),
  };
}
