// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toDrawingNumber } from './candle-series.js';
import type { Layout, PanelForming, PanelInput, PanelModel, Scale } from './next-candle-model.js';

const PRECISION = 100;

export const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;
export const pointText = (x: number, y: number): string => `${round(x)},${round(y)}`;

function xOfTime(at: number, window: PanelInput['window'], layout: Layout): number {
  const fraction = (at - window.start) / (window.end - window.start);
  return layout.split + Math.min(Math.max(fraction, 0), 1) * (layout.right - layout.split);
}

export function buildTrail(
  input: PanelInput,
  scale: Scale,
  layout: Layout,
): Pick<PanelModel, 'trail' | 'now'> {
  const last = input.trail.at(-1);
  if (last === undefined) return { trail: undefined, now: undefined };
  const lastClose = input.recent.at(-1)?.close;
  const start =
    lastClose === undefined ? [] : [pointText(layout.split, scale(toDrawingNumber(lastClose)))];
  const points = input.trail.map((point) =>
    pointText(xOfTime(point.at, input.window, layout), scale(toDrawingNumber(point.close))),
  );
  const now = {
    x: round(xOfTime(last.at, input.window, layout)),
    y: round(scale(toDrawingNumber(last.close))),
  };
  return { trail: [...start, ...points].join(' '), now };
}

type FormingContext = { readonly layout: Layout; readonly now: PanelModel['now'] };

export function buildForming(
  input: PanelInput,
  scale: Scale,
  { layout, now }: FormingContext,
): PanelForming | undefined {
  if (input.forming === undefined || now === undefined) return undefined;
  const high = scale(toDrawingNumber(input.forming.high));
  const low = scale(toDrawingNumber(input.forming.low));
  return {
    x: round(layout.split),
    width: round(Math.max(now.x - layout.split, 1)),
    top: round(high),
    height: round(Math.max(low - high, 1)),
    isUp: toDrawingNumber(input.forming.close) >= toDrawingNumber(input.forming.open),
  };
}
