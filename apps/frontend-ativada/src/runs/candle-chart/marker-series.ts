// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartMarker } from '../trade-chart.validation.js';
import { formatPrice } from '../../format/format.js';
import { MARKER_LABEL } from './candle-chart.constant.js';
import type { ExitBracket } from './display-mapping.js';
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { SurfaceMarker } from './chart-surface.types.js';

type MarkerSource = Pick<ChartMarker, 'positionKey' | 'side' | 'candleTime'>;

type PricedMarker = MarkerSource & Pick<ChartMarker, 'price' | 'fee'>;

// A seta fica na vela que CONTÉM o preenchimento, qualquer que seja a vela da tela (spec 005, D6).
function snapToCandle(candleTime: number, timeframeMilliseconds: number): number {
  return Math.floor(candleTime / timeframeMilliseconds) * timeframeMilliseconds;
}

// `null` = o servidor agrupou os eventos (acima de 500 na faixa): o gráfico desenha os agrupamentos, não setas.
export function toSurfaceMarkers(
  markers: readonly PricedMarker[] | null,
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
      price: toDrawingNumber(marker.price),
      priceText: formatPrice(marker.price),
      isSelected: marker.positionKey === selectedKey,
    }))
    .sort((left, right) => left.time - right.time);
}

const EXIT_WORD: Readonly<Record<string, string>> = {
  target: 'pelo alvo',
  stop: 'pela proteção',
  gap: 'por falta de dados do mercado',
};

// A venda por alvo, proteção ou lacuna ganha o colchete sobre as velas de exibição da vela de 15 min em que aconteceu.
export function applyExitBrackets(
  markers: readonly SurfaceMarker[],
  brackets: readonly ExitBracket[],
): SurfaceMarker[] {
  if (brackets.length === 0) return [...markers];
  const lastOpenByKey = new Map(
    brackets.map((bracket) => [`${bracket.positionKey}:sell`, bracket.lastOpen]),
  );
  return markers.map((marker) => {
    const lastOpen = lastOpenByKey.get(marker.key);
    return lastOpen === undefined ? marker : { ...marker, endTime: toSurfaceTime(lastOpen) };
  });
}

export type BracketTextParams = {
  readonly brackets: readonly ExitBracket[];
  readonly shownOpen: number;
  readonly formatTime: (milliseconds: number) => string;
};

// "Saiu pela proteção entre 10:15 e 10:30 (a simulação decide em velas de 15 min)" nas velas do colchete.
export function describeBracketAt(params: BracketTextParams): string | undefined {
  const { brackets, shownOpen, formatTime } = params;
  const hit = brackets.find(
    (bracket) => shownOpen >= bracket.firstOpen && shownOpen <= bracket.lastOpen,
  );
  if (hit === undefined) return undefined;
  const word = EXIT_WORD[hit.reason] ?? 'dentro da vela';
  return `Saiu ${word} entre ${formatTime(hit.from)} e ${formatTime(hit.to)} (a simulação decide em velas de 15 min)`;
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

// "Compra a 12,45 · taxa 0,01" para a vela de abertura dada (a dica ao apontar a vela); `undefined` sem operação.
export function describeTradesAt(
  markers: readonly PricedMarker[] | null,
  candleOpenTime: number,
  timeframeMilliseconds: number,
): string | undefined {
  const here = (markers ?? []).filter(
    (marker) => snapToCandle(marker.candleTime, timeframeMilliseconds) === candleOpenTime,
  );
  if (here.length === 0) return undefined;
  return here
    .map(
      (marker) =>
        `${MARKER_LABEL[marker.side]} a ${formatPrice(marker.price)} · taxa ${formatPrice(marker.fee)}`,
    )
    .join('; ');
}
