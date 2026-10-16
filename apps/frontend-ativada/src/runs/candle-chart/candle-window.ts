// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CANDLE_PAGE_SIZE, INITIAL_VISIBLE_BARS } from './candle-chart.constant.js';
import type { PageRange } from './candle-paging.js';

export type CandleWindowParams = {
  // O período inteiro da execução (o que a API de gráfico devolve em `runRange`).
  readonly extent: PageRange;
  // A faixa da URL já recortada ao período; sem ela o gráfico acompanha o fim.
  readonly range: PageRange | undefined;
  // O instante que a pessoa quer no centro (troca de vela); some quando ela escolhe outra faixa.
  readonly focus: number | undefined;
  readonly timeframeMilliseconds: number;
};

export type CandleWindow = {
  readonly range: PageRange;
  // Identifica a série: enquanto não muda, a janela só cresce no fim (vela nova) e nada é descartado nem reajustado.
  readonly anchor: string;
};

// Execução curta (a que começou há pouco): completa a abertura do gráfico com velas de ANTES do início, só como contexto.
export function withLeadingContext(extent: PageRange, timeframeMilliseconds: number): PageRange {
  if (timeframeMilliseconds <= 0) return extent;
  const runCandles = Math.ceil((extent.to - extent.from) / timeframeMilliseconds);
  const missing = Math.max(0, INITIAL_VISIBLE_BARS - runCandles);
  return { from: Math.max(0, extent.from - missing * timeframeMilliseconds), to: extent.to };
}

function lastPage(end: PageRange['to'], start: PageRange['from'], span: number): PageRange {
  return { from: Math.max(start, end - span), to: end };
}

// A primeira página de velas: as últimas 1.000 da faixa (ou do período), ou 1.000 em volta do instante em foco.
export function computeCandleWindow(params: CandleWindowParams): CandleWindow {
  const { extent, range, focus, timeframeMilliseconds } = params;
  const span = CANDLE_PAGE_SIZE * timeframeMilliseconds;
  if (focus !== undefined) {
    const from = Math.max(extent.from, Math.min(focus - span / 2, extent.to - span));
    const to = Math.min(extent.to, from + span);
    if (to > from) return { range: { from, to }, anchor: `focus:${focus}` };
  }
  if (range !== undefined) {
    return {
      range: lastPage(range.to, range.from, span),
      anchor: `range:${range.from}-${range.to}`,
    };
  }
  return { range: lastPage(extent.to, extent.from, span), anchor: 'end' };
}
