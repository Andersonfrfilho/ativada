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
  selectedKey?: string,
): SurfaceMarker[] {
  if (markers === null) return [];
  return markers
    .map((marker) => ({
      key: `${marker.positionKey}:${marker.side}`,
      time: toSurfaceTime(snapToCandle(marker.candleTime, timeframeMilliseconds)),
      side: marker.side,
      label: MARKER_LABEL[marker.side],
      isSelected: marker.positionKey === selectedKey,
    }))
    .sort((left, right) => left.time - right.time);
}

// A compra ou a venda que cai na vela de abertura dada (a seta que a pessoa clicou); a primeira, se forem duas.
export function findPositionKeyAt(
  markers: readonly MarkerSource[] | null,
  candleOpenTime: number,
  timeframeMilliseconds: number,
): string | undefined {
  const match = markers?.find(
    (marker) => snapToCandle(marker.candleTime, timeframeMilliseconds) === candleOpenTime,
  );
  return match?.positionKey;
}

type CandleOpening = { readonly openTime: number };

// Os índices (na lista de velas carregada) das velas com compra ou venda, em ordem: o pulo do Shift+seta (RF20).
// `null` = eventos agrupados pelo servidor: sem setas, sem pulo.
export function listEventIndexes(
  candles: readonly CandleOpening[],
  markers: readonly MarkerSource[] | null,
  timeframeMilliseconds: number,
): number[] {
  if (markers === null || timeframeMilliseconds <= 0) return [];
  const times = new Set(markers.map((m) => snapToCandle(m.candleTime, timeframeMilliseconds)));
  return candles.flatMap((candle, index) => (times.has(candle.openTime) ? [index] : []));
}

// "compra", "venda" ou "compra e venda" para a vela de abertura dada; `undefined` sem operação.
export function describeEventsAt(
  markers: readonly MarkerSource[] | null,
  candleOpenTime: number,
  timeframeMilliseconds: number,
): string | undefined {
  const here = (markers ?? []).filter(
    (marker) => snapToCandle(marker.candleTime, timeframeMilliseconds) === candleOpenTime,
  );
  const hasBuy = here.some((marker) => marker.side === 'buy');
  const hasSell = here.some((marker) => marker.side === 'sell');
  if (hasBuy && hasSell) return 'compra e venda';
  if (hasBuy) return 'compra';
  return hasSell ? 'venda' : undefined;
}
