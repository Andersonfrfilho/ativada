// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartMarker } from '../trade-chart.validation.js';
import { MARKER_LABEL } from './candle-chart.constant.js';
import { toSurfaceTime } from './candle-series.js';
import type { SurfaceMarker } from './chart-surface.types.js';

type MarkerSource = Pick<ChartMarker, 'positionKey' | 'side' | 'candleTime'>;

// A seta fica na vela que CONTÉM o preenchimento, qualquer que seja a vela da tela (spec 005, D6).
function snapToCandle(candleTime: number, timeframeMilliseconds: number): number {
  return Math.floor(candleTime / timeframeMilliseconds) * timeframeMilliseconds;
}

// `null` = o servidor agrupou os eventos (acima de 500 na faixa): o gráfico desenha os agrupamentos, não setas.
export function toSurfaceMarkers(
  markers: readonly MarkerSource[] | null,
  timeframeMilliseconds: number,
): SurfaceMarker[] {
  if (markers === null) return [];
  return markers
    .map((marker) => ({
      key: `${marker.positionKey}:${marker.side}`,
      time: toSurfaceTime(snapToCandle(marker.candleTime, timeframeMilliseconds)),
      side: marker.side,
      label: MARKER_LABEL[marker.side],
    }))
    .sort((left, right) => left.time - right.time);
}
