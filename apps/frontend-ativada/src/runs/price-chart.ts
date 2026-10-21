// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../format/decimal.js';
import type { PriceColumn } from './trade-chart.validation.js';

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 300;
export const MIN_CHART_COLUMNS = 100;
export const MAX_CHART_COLUMNS = 2_000;
export const MAX_PATH_POINTS = 2_000;

const MARGIN = { left: 62, right: 16, top: 18, bottom: 28 } as const;
const PRICE_PADDING_RATIO = 0.06;

export type PlotArea = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

export type ChartScale = {
  readonly plot: PlotArea;
  readonly x: (time: number) => number;
  readonly y: (price: number) => number;
};

export type PriceBounds = { readonly low: string; readonly high: string };
export type PricePoint = { readonly x: number; readonly y: number };

export type ScaleParams = {
  readonly from: number;
  readonly to: number;
  readonly bounds: PriceBounds | undefined;
};

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// O servidor reduz a série ao número de colunas pedido: uma por pixel de desenho, nos limites do contrato.
export function chartColumnsFor(width: number): number {
  return clamp(Math.round(width), MIN_CHART_COLUMNS, MAX_CHART_COLUMNS);
}

function isFinitePrice(text: string): boolean {
  return Number.isFinite(Number(text));
}

// A mínima e a máxima do período, comparadas em BigInt de escala 8 e devolvidas como o texto que veio do servidor.
export function findPriceBounds(columns: readonly PriceColumn[]): PriceBounds | undefined {
  let low: { readonly text: string; readonly scaled: bigint } | undefined;
  let high: { readonly text: string; readonly scaled: bigint } | undefined;
  for (const column of columns) {
    const lowScaled = parseScaled(column.low);
    const highScaled = parseScaled(column.high);
    if (lowScaled === undefined || highScaled === undefined) continue;
    if (low === undefined || lowScaled < low.scaled) low = { text: column.low, scaled: lowScaled };
    if (high === undefined || highScaled > high.scaled) {
      high = { text: column.high, scaled: highScaled };
    }
  }
  return low === undefined || high === undefined ? undefined : { low: low.text, high: high.text };
}

// Preço maior fica mais alto na tela (y menor); período ou preço achatado vai para o meio em vez de dividir por zero.
export function createChartScale(params: ScaleParams): ChartScale {
  const plot = {
    left: MARGIN.left,
    right: CHART_WIDTH - MARGIN.right,
    top: MARGIN.top,
    bottom: CHART_HEIGHT - MARGIN.bottom,
  };
  const lowest = params.bounds === undefined ? 0 : Number(params.bounds.low);
  const highest = params.bounds === undefined ? 0 : Number(params.bounds.high);
  const pad = (highest - lowest) * PRICE_PADDING_RATIO;
  const floor = lowest - pad;
  const ceiling = highest + pad;
  const duration = params.to - params.from;
  return {
    plot,
    x: (time) =>
      duration <= 0
        ? (plot.left + plot.right) / 2
        : plot.left + ((time - params.from) / duration) * (plot.right - plot.left),
    y: (price) =>
      ceiling === floor
        ? (plot.top + plot.bottom) / 2
        : plot.top + (1 - (price - floor) / (ceiling - floor)) * (plot.bottom - plot.top),
  };
}

// Mantém o primeiro e o último e nunca passa de `limit` pontos, qualquer que seja o tamanho da lista.
function sampleEvenly<TItem>(items: readonly TItem[], limit: number): readonly TItem[] {
  if (items.length <= limit) return items;
  const stride = Math.ceil(items.length / (limit - 1));
  const sampled = items.filter((_, index) => index % stride === 0);
  const last = items[items.length - 1];
  return last === undefined || sampled.includes(last) ? sampled : [...sampled, last];
}

function columnTime(column: PriceColumn): number {
  return (column.startTime + column.endTime) / 2;
}

// A linha liga o fechamento (`last`) de cada coluna; coluna sem preço legível é pulada e a linha segue.
export function buildLinePoints(
  scale: ChartScale,
  columns: readonly PriceColumn[],
): readonly PricePoint[] {
  const points = columns
    .filter((column) => isFinitePrice(column.last))
    .map((column) => ({ x: scale.x(columnTime(column)), y: scale.y(Number(column.last)) }));
  return sampleEvenly(points, MAX_PATH_POINTS);
}

// A faixa clara é o contorno fechado da máxima (ida) e da mínima (volta) de cada coluna.
export function buildBandPoints(
  scale: ChartScale,
  columns: readonly PriceColumn[],
): readonly PricePoint[] {
  const readable = columns.filter((c) => isFinitePrice(c.low) && isFinitePrice(c.high));
  const sampled = sampleEvenly(readable, MAX_PATH_POINTS / 2);
  const upper = sampled.map((c) => ({ x: scale.x(columnTime(c)), y: scale.y(Number(c.high)) }));
  const lower = sampled.map((c) => ({ x: scale.x(columnTime(c)), y: scale.y(Number(c.low)) }));
  return [...upper, ...lower.reverse()];
}

export function toPathData(points: readonly PricePoint[], isClosed: boolean): string {
  if (points.length === 0) return '';
  const commands = points.map(
    (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
  );
  return isClosed ? `${commands.join(' ')} Z` : commands.join(' ');
}
