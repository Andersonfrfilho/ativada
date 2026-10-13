// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  clamp,
  toPathData,
  type ChartScale,
  type PricePoint,
} from './price-chart.js';
import type { ChartCluster, ChartMarker, PriceColumn } from './trade-chart.validation.js';

const ARROW_WIDTH = 14;
const ARROW_HEIGHT = 18;
const ARROW_HEAD = 9;
const ARROW_SHAFT = 6;
const ARROW_GAP = 5;
export const HIT_RADIUS = 16;
const CLUSTER_MIN_RADIUS = 9;
const CLUSTER_MAX_RADIUS = 18;

export type MarkerPlacement = {
  readonly side: ChartMarker['side'];
  readonly x: number;
  readonly centerY: number;
  readonly path: string;
};

// Seta com haste: o desenho aponta para o lado da operação, a ponta fica do lado do preço.
export function arrowPath(side: ChartMarker['side'], x: number, centerY: number): string {
  const half = ARROW_WIDTH / 2;
  const shaft = ARROW_SHAFT / 2;
  const top = centerY - ARROW_HEIGHT / 2;
  const bottom = centerY + ARROW_HEIGHT / 2;
  const isUp = side === 'buy';
  const tip = isUp ? top : bottom;
  const headBase = isUp ? top + ARROW_HEAD : bottom - ARROW_HEAD;
  const tail = isUp ? bottom : top;
  const points: readonly PricePoint[] = [
    { x, y: tip },
    { x: x + half, y: headBase },
    { x: x + shaft, y: headBase },
    { x: x + shaft, y: tail },
    { x: x - shaft, y: tail },
    { x: x - shaft, y: headBase },
    { x: x - half, y: headBase },
  ];
  return toPathData(points, true);
}

// Compra fica ABAIXO do preço (seta para cima) e venda ACIMA (seta para baixo): forma e posição, não só cor.
export function placeMarker(scale: ChartScale, marker: ChartMarker): MarkerPlacement {
  const priceY = scale.y(Number(marker.price));
  const offset = ARROW_GAP + ARROW_HEIGHT / 2;
  const wanted = marker.side === 'buy' ? priceY + offset : priceY - offset;
  const centerY = clamp(wanted, HIT_RADIUS, CHART_HEIGHT - HIT_RADIUS);
  const x = clamp(scale.x(marker.candleTime), scale.plot.left, scale.plot.right);
  return { side: marker.side, x, centerY, path: arrowPath(marker.side, x, centerY) };
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// "12 compras, 11 vendas"; um lado zerado não aparece.
export function describeCluster(cluster: ChartCluster): string {
  const parts = [
    cluster.buys > 0 ? pluralize(cluster.buys, 'compra', 'compras') : undefined,
    cluster.sells > 0 ? pluralize(cluster.sells, 'venda', 'vendas') : undefined,
  ];
  return parts.filter((part) => part !== undefined).join(', ');
}

export type ClusterPlacement = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly count: number;
  readonly label: string;
};

// A coluna de preço que começa por último antes de `time`: é o balde do agrupamento (mesma fórmula na API).
function findColumnAt(columns: readonly PriceColumn[], time: number): PriceColumn | undefined {
  let low = 0;
  let high = columns.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((columns[middle]?.startTime ?? Infinity) <= time) low = middle;
    else high = middle - 1;
  }
  return columns[low];
}

// O agrupamento senta sobre a linha de preço da sua coluna; o raio cresce devagar com a quantidade.
export function placeCluster(
  scale: ChartScale,
  columns: readonly PriceColumn[],
  cluster: ChartCluster,
): ClusterPlacement {
  const count = cluster.buys + cluster.sells;
  const radius = Math.min(CLUSTER_MAX_RADIUS, CLUSTER_MIN_RADIUS + Math.log2(Math.max(count, 1)));
  const middle = (cluster.startTime + cluster.endTime) / 2;
  const column = findColumnAt(columns, middle);
  const priceY =
    column === undefined ? (scale.plot.top + scale.plot.bottom) / 2 : scale.y(Number(column.last));
  return {
    x: clamp(scale.x(middle), scale.plot.left, CHART_WIDTH - radius),
    y: clamp(priceY, radius, CHART_HEIGHT - radius),
    radius,
    count,
    label: describeCluster(cluster),
  };
}

export function markerKey(marker: ChartMarker): string {
  return `${marker.side}:${marker.positionKey}:${marker.candleTime}`;
}

export function clusterKey(cluster: ChartCluster): string {
  return `cluster:${cluster.startTime}`;
}

// A API já entrega em ordem de tempo; o teclado depende disso, então a ordem é garantida aqui.
export function sortMarkers(markers: readonly ChartMarker[]): readonly ChartMarker[] {
  return [...markers].sort((a, b) => a.candleTime - b.candleTime);
}

export function sortClusters(clusters: readonly ChartCluster[]): readonly ChartCluster[] {
  return [...clusters].sort((a, b) => a.startTime - b.startTime);
}
